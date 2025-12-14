from flask import Flask, render_template, request, redirect, url_for, send_file, jsonify
import json
import os
from werkzeug.utils import secure_filename
from flask_socketio import SocketIO, emit
import base64
import cv2
import numpy as np
import uuid
import io
from datetime import datetime
import tempfile
import threading
import time
import trimesh


app = Flask(__name__)

# Конфигурация
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'tiff', 'tif'}
DEFAULT_IMAGE = 'current_image.png'  # Всегда одно и то же имя файла
RESULT_IMAGE = 'result_image.png' # Изображение полученное в процессе манипуляций
# Папка для сохранения сцен
SCENES_FOLDER = 'saved_scenes'
if not os.path.exists(SCENES_FOLDER):
    os.makedirs(SCENES_FOLDER)

def allowed_file(filename):
    """Проверяем, что файл имеет допустимое расширение"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_corrupted_image(file_stream):
    """Проверяем, что файл изображения не поврежден с помощью OpenCV"""
    try:
        # Читаем данные файла в массив numpy
        file_bytes = np.frombuffer(file_stream.read(), np.uint8)
        
        # Пытаемся декодировать изображение с помощью OpenCV
        image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        
        # Возвращаем поток в начало для дальнейшего использования
        file_stream.seek(0)
        
        # Если image is None, значит OpenCV не смог декодировать изображение
        if image is None:
            return True  # Файл поврежден
        
        # Дополнительная проверка - изображение должно иметь валидные размеры
        if image.shape[0] == 0 or image.shape[1] == 0:
            return True  # Файл поврежден
            
        return False  # Файл не поврежден
        
    except Exception as e:
        print(f"Ошибка проверки изображения OpenCV: {e}")
        return True  # Файл поврежден

# Обработчик ошибки 413 (Request Entity Too Large)
@app.errorhandler(413)
def too_large(e):
    return render_template('index.html', error="Файл слишком большой. Максимальный размер: 16MB")

@app.route("/")
def name():
    # Проверяем, существует ли файл
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], RESULT_IMAGE)
    if os.path.exists(file_path):
        return render_template('index.html', temp_filename=RESULT_IMAGE)
    return render_template('index.html')

@app.route('/vector_graphics')
def vector_graphics():
    return render_template('vectorGraphics.html')

@app.route('/upload', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return render_template('index.html', temp_filename=RESULT_IMAGE)
    
    file = request.files['image']
    
    if file.filename == '':
        return render_template('index.html', temp_filename=RESULT_IMAGE)
    
    try:
        # Всегда сохраняем под одним именем (перезаписываем)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], DEFAULT_IMAGE)
        file.save(file_path)
        
        result_file_path = os.path.join(app.config['UPLOAD_FOLDER'], RESULT_IMAGE)
        file.save(result_file_path)

        return render_template('index.html', temp_filename=RESULT_IMAGE)
        
    except Exception as e:
        return render_template('index.html', 
                             temp_filename=RESULT_IMAGE, 
                             error=f"Ошибка: {str(e)}")

import tempfile
import os
from flask import send_file

@app.route('/save', methods=['POST'])
def save_image():
    try:
        format_type = request.form.get('format', 'JPEG')
        quality = int(request.form.get('quality', 95))
        
        # Всегда читаем из одного и того же файла
        current_image_path = os.path.join(app.config['UPLOAD_FOLDER'], RESULT_IMAGE)
        
        # Проверяем существует ли файл
        if not os.path.exists(current_image_path):
            return render_template('index.html', 
                                 error="Нет изображения для сохранения. Сначала загрузите изображение.")
        
        # Читаем изображение
        image = cv2.imread(current_image_path)
        
        if image is None:
            return render_template('index.html', error="Ошибка чтения изображения")
        
        # Настройка параметров сохранения
        save_params = []
        if format_type.upper() == 'JPEG':
            save_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        elif format_type.upper() == 'PNG':
            save_params = [cv2.IMWRITE_PNG_COMPRESSION, 9]
        elif format_type.upper() == 'TIFF':
            save_params = [cv2.IMWRITE_TIFF_COMPRESSION, 1]
        
        # Создаем временный файл (не сохраняется в папке проекта)
        with tempfile.NamedTemporaryFile(suffix=f'.{format_type.lower()}', delete=False) as tmp_file:
            temp_filepath = tmp_file.name
        
        # Сохраняем во временный файл
        success = cv2.imwrite(temp_filepath, image, save_params)
        
        if not success:
            os.unlink(temp_filepath)  # Удаляем временный файл при ошибке
            return render_template('index.html', error="Ошибка сохранения файла")
        
        # Отправляем файл пользователю
        response = send_file(
            temp_filepath, 
            as_attachment=True, 
            download_name=f"image.{format_type.lower()}"
        )
        
        # Автоматически удаляем временный файл после отправки
        @response.call_on_close
        def cleanup():
            try:
                if os.path.exists(temp_filepath):
                    os.unlink(temp_filepath)
            except:
                pass
        
        return response
        
    except Exception as e:
        # Удаляем временный файл при ошибке
        try:
            if 'temp_filepath' in locals() and os.path.exists(temp_filepath):
                os.unlink(temp_filepath)
        except:
            pass
        
        return render_template('index.html', error=f"Ошибка при сохранении: {str(e)}")
            

# Главная функция с которой вы будете работать
@app.route("/modify", methods=["POST"])
def modify():
    if request.method != "POST":
        return jsonify({'error': 'No image file'}), 400

    current_image_path = os.path.join(app.config['UPLOAD_FOLDER'], DEFAULT_IMAGE)
    image = cv2.imread(current_image_path)


    size_change = request.form.get("size_change")
    if (size_change):
        new_size = (int(image.shape[1] * float(size_change)), int(image.shape[0] * float(size_change)))
        image = cv2.resize(image, new_size, cv2.INTER_AREA)

    
    rotation_change = request.form.get("rotation_change")
    if (rotation_change):
        (h, w) = image.shape[:2]
        center = (w/2, h/2)
        matrix = cv2.getRotationMatrix2D(center, int(rotation_change), 1.0)
        image = cv2.warpAffine(image, matrix, (w, h))


    horizontal_flip = request.form.get("horizontal_flip_change")
    if (horizontal_flip == 'true'):
        image = cv2.flip(image, 1)

    vertical_flip = request.form.get("vertical_flip_change")
    if (vertical_flip == 'true'):
        image = cv2.flip(image, 0)


    crop_x = request.form.get("crop_x_change")
    crop_y = request.form.get("crop_y_change")
    crop_width = request.form.get("crop_width_change")
    crop_height = request.form.get("crop_height_change")
    if (crop_x and crop_y and crop_width and crop_height):
        crop_x = int(crop_x)
        crop_y = int(crop_y)
        crop_width = int(crop_width)
        crop_height = int(crop_height)
        height, width, _ = image.shape
        image = image[
            int(crop_y/100.0 * height) : int(crop_y/100.0 * height) + int(crop_height/100.0 * height),
            int(crop_x/100.0 * width) : int(crop_x/100.0 * width) + int(crop_width/100.0 * width)]


    brightness_change = request.form.get("brightness_change")
    if (brightness_change):
        normalized = image / 255.0
        corrected = np.pow(normalized, 1/float(brightness_change))
        image = np.astype(corrected * 255, int)


    contrast_change = request.form.get("contrast_change")
    if (contrast_change and float(contrast_change) != 0):
        blurred = cv2.GaussianBlur(image.astype(np.float32), (5, 5), float(contrast_change))
        image = np.clip(cv2.addWeighted(image.astype(np.float32), 1.5, blurred, -0.5, 0), 0, 255).astype(int)

        

    red_channel_change = request.form.get("red_channel_change")
    green_channel_change = request.form.get("green_channel_change")
    blue_channel_change = request.form.get("blue_channel_change")
    if (red_channel_change and green_channel_change and blue_channel_change):
        b, g, r = cv2.split(image)
        b = (np.pow(b.astype(np.float32)/255.0, 1/float(blue_channel_change))*255).astype(np.uint8)
        g = (np.pow(g.astype(np.float32)/255.0, 1/float(green_channel_change))*255).astype(np.uint8)
        r = (np.pow(r.astype(np.float32)/255.0, 1/float(red_channel_change))*255).astype(np.uint8)
        image = cv2.merge([b, g, r])


    noise_type = request.form.get("noise_type_change")
    noise_sigma = request.form.get("noise_sigma_change")
    pepper_percent = request.form.get("pepper_percent")
    salt_percent = request.form.get("salt_percent")
    np.random.seed(0)
    if (noise_type == "gauss"):
        gauss = np.random.normal(0, int(noise_sigma), image.shape)
        image = image.astype(np.float32) + gauss
        image = np.clip(image, 0, 255).astype(np.uint8)
    if (noise_type == "salt_pepper"):
        total = image.size
        
        pepper_coords = np.random.randint([0, 0], [image.shape[0], image.shape[1]], (int(total * float(pepper_percent)), 2))
        salt_coords = np.random.randint([0, 0], [image.shape[0], image.shape[1]], (int(total * float(salt_percent)), 2))

        image[pepper_coords[:,0], pepper_coords[:, 1]] = 0
        image[salt_coords[:,0], salt_coords[:, 1]] = 255


    blur_method = request.form.get("blur_method_change")
    conv_radius = request.form.get("conv_radius_change")
    blur_weight = request.form.get("blur_weight_change")
    if (blur_method and conv_radius and blur_weight and blur_method != "nothing"):
        if blur_method == "gauss":
            image = cv2.GaussianBlur(image, (int(conv_radius), int(conv_radius)), int(blur_weight))
        elif blur_method == "mean":
            image = cv2.blur(image, (int(conv_radius), int(conv_radius)))
        elif blur_method == "median":
            image = cv2.medianBlur(image, int(conv_radius))
    



    result_file_path = os.path.join(app.config['UPLOAD_FOLDER'], RESULT_IMAGE)
    cv2.imwrite(result_file_path, image)


    _, img_encoded = cv2.imencode('.png', image)
    img_bytes = img_encoded.tobytes()
    return send_file(
        io.BytesIO(img_bytes),
        mimetype="image/png",
        as_attachment = False
    )

@app.route('/editor3d')
def treeDgraphic():
    """Главная страница редактора"""
    return render_template('editor3d.html')

@app.route('/editor3d/api/scene/new', methods=['POST'])
def new_scene():
    """Создание новой сцены"""
    data = request.json
    scene_size = data.get('size', 10)
    
    # Создаем новую сцену
    scene_data = {
        'id': datetime.now().strftime('%Y%m%d_%H%M%S'),
        'name': f'Сцена_{datetime.now().strftime("%H:%M:%S")}',
        'created': datetime.now().isoformat(),
        'size': scene_size,
        'objects': [],
        'background': '#1a1a2e',
        'grid': True,
        'axes': True
    }
    
    return jsonify(scene_data)

@app.route('/editor3d/api/scene/save', methods=['POST'])
def save_scene():
    """Сохранение сцены в файл"""
    scene_data = request.json
    
    filename = f"{scene_data['id']}.json"
    filepath = os.path.join(SCENES_FOLDER, filename)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(scene_data, f, ensure_ascii=False, indent=2)
    
    return jsonify({'success': True, 'filename': filename})

@app.route('/editor3d/api/scene/load', methods=['GET'])
def load_scenes():
    """Загрузка списка сохраненных сцен"""
    scenes = []
    
    for filename in os.listdir(SCENES_FOLDER):
        if filename.endswith('.json'):
            filepath = os.path.join(SCENES_FOLDER, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                scene_data = json.load(f)
                scenes.append(scene_data)
    
    return jsonify({'scenes': scenes})

@app.route('/editor3d/api/scene/load/<scene_id>', methods=['GET'])
def load_scene(scene_id):
    """Загрузка конкретной сцены"""
    filename = f"{scene_id}.json"
    filepath = os.path.join(SCENES_FOLDER, filename)
    
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            scene_data = json.load(f)
        return jsonify(scene_data)
    
    return jsonify({'error': 'Scene not found'}), 404

@app.route('/editor3d/api/object/create', methods=['POST'])
def create_object():
    """Создание нового объекта (для Python-обработки)"""
    data = request.json
    obj_type = data.get('type', 'cube')
    
    # Здесь можно использовать trimesh для создания объектов
    # Для простоты возвращаем JSON с параметрами
    
    base_object = {
        'id': f"obj_{datetime.now().strftime('%H%M%S_%f')}",
        'type': obj_type,
        'name': f"{obj_type.capitalize()}",
        'position': data.get('position', [0, 0, 0]),
        'scale': data.get('scale', [1, 1, 1]),
        'rotation': data.get('rotation', [0, 0, 0]),
        'color': data.get('color', '#3498db'),
        'material': data.get('material', 'standard'),
        'visible': True,
        'created': datetime.now().isoformat()
    }
    
    # Добавляем специфичные параметры для каждого типа
    if obj_type == 'cube':
        base_object['size'] = data.get('size', [1, 1, 1])
    elif obj_type == 'sphere':
        base_object['radius'] = data.get('radius', 1)
        base_object['segments'] = data.get('segments', 32)
    elif obj_type == 'cylinder':
        base_object['radius'] = data.get('radius', 0.5)
        base_object['height'] = data.get('height', 2)
        base_object['segments'] = data.get('segments', 32)
    elif obj_type == 'cone':
        base_object['radius'] = data.get('radius', 0.5)
        base_object['height'] = data.get('height', 2)
        base_object['segments'] = data.get('segments', 32)
    elif obj_type == 'torus':
        base_object['radius'] = data.get('radius', 1)
        base_object['tube'] = data.get('tube', 0.3)
        base_object['segments'] = data.get('segments', 32)
    
    return jsonify(base_object)

if __name__ == '__main__':
    app.run(debug=True)