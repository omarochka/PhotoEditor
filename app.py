from flask import Flask, render_template, request, redirect, url_for, send_file
import os
from werkzeug.utils import secure_filename
import base64
import cv2
import numpy as np
import uuid

app = Flask(__name__)

# Конфигурация
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'tiff', 'tif'}

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
    return render_template('index.html')

@app.route('/vector_graphics')
def vector_graphics():
    return render_template('vectorGraphics.html')

@app.route('/3d_graphics')
def three_d_graphics():
    return render_template('3dGraphics.html')

@app.route('/upload', methods=['POST'])
def upload_image():
    # Проверяем, есть ли файл в запросе
    if 'image' not in request.files:
        return render_template('index.html', error="Файл не выбран")
    
    file = request.files['image']
    
    # Если пользователь не выбрал файл
    if file.filename == '':
        return render_template('index.html', error="Файл не выбран")
    
    # Проверяем расширение файла
    if not allowed_file(file.filename):
        return render_template('index.html', error="Неподдерживаемый формат файла. Разрешены: JPEG, PNG, TIFF")
    
    # Проверяем размер файла (дополнительная проверка)
    file.seek(0, os.SEEK_END)
    file_length = file.tell()
    file.seek(0)  # Возвращаем указатель в начало
    
    if file_length > app.config['MAX_CONTENT_LENGTH']:
        return render_template('index.html', error=f"Файл слишком большой. Размер: {file_length//1024//1024}MB, максимум: {app.config['MAX_CONTENT_LENGTH']//1024//1024}MB")

    # Проверяем, что файл не поврежден
    if is_corrupted_image(file.stream):
        return render_template('index.html', error="Файл изображения поврежден")
    
    try:
        # Вместо base64 сохраняем файл и запоминаем имя
        filename = str(uuid.uuid4()) + '.png'
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        # Сохраняем только имя файла в сессии
        # или передаем в шаблон как hidden field
        return render_template('index.html', temp_filename=filename)
        
    except Exception as e:
        return render_template('index.html', error=f"Ошибка при обработке файла: {str(e)}")

@app.route('/save', methods=['POST'])
def save_image():
    try:
        # Получаем временное имя файла вместо base64
        temp_filename = request.form.get('temp_filename')
        format_type = request.form.get('format', 'JPEG')
        quality = int(request.form.get('quality', 95))
        
        if not temp_filename:
            return render_template('index.html', error="Нет изображения для сохранения")
        
        # Читаем из временного файла
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], temp_filename)
        image = cv2.imread(temp_path)
        
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
        
        # Сохраняем изображение
        filename = f"image.{format_type.lower()}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        success = cv2.imwrite(filepath, image, save_params)
        
        if not success:
            return render_template('index.html', error="Ошибка сохранения файла")
        
        # Отправляем файл пользователю
        return send_file(filepath, as_attachment=True, download_name=filename)
        
    except Exception as e:
        return render_template('index.html', error=f"Ошибка при сохранении: {str(e)}")

if __name__ == '__main__':
    app.run(debug=True)