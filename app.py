from flask import Flask, render_template, request, redirect, url_for, send_file
import os
from werkzeug.utils import secure_filename
import base64
import cv2
import numpy as np
import uuid
from datetime import datetime

app = Flask(__name__)

# Конфигурация
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'tiff', 'tif'}
DEFAULT_IMAGE = 'current_image.png'  # Всегда одно и то же имя файла

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
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], DEFAULT_IMAGE)
    if os.path.exists(file_path):
        return render_template('index.html', temp_filename=DEFAULT_IMAGE)
    return render_template('index.html')

@app.route('/vector_graphics')
def vector_graphics():
    return render_template('vectorGraphics.html')

@app.route('/3d_graphics')
def three_d_graphics():
    return render_template('3dGraphics.html')

@app.route('/upload', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return render_template('index.html', temp_filename=DEFAULT_IMAGE)
    
    file = request.files['image']
    
    if file.filename == '':
        return render_template('index.html', temp_filename=DEFAULT_IMAGE)
    
    try:
        # Всегда сохраняем под одним именем (перезаписываем)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], DEFAULT_IMAGE)
        file.save(file_path)
        
        return render_template('index.html', temp_filename=DEFAULT_IMAGE)
        
    except Exception as e:
        return render_template('index.html', 
                             temp_filename=DEFAULT_IMAGE, 
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
        current_image_path = os.path.join(app.config['UPLOAD_FOLDER'], 'current_image.png')
        
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

if __name__ == '__main__':
    app.run(debug=True)