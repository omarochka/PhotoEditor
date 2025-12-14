from flask import Flask, render_template, request, redirect, url_for, send_file, jsonify
import os
from werkzeug.utils import secure_filename
import base64
import cv2
import numpy as np
import uuid
import io
from datetime import datetime
import json
import svgwrite
import xml.etree.ElementTree as ET
from pathlib import Path
import traceback
try:
    import requests
    from requests.exceptions import RequestException
    REQUESTS_AVAILABLE = True
except Exception:
    requests = None
    RequestException = Exception
    REQUESTS_AVAILABLE = False
import base64 as _base64

app = Flask(__name__)

# Конфигурация
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'tiff', 'tif'}
DEFAULT_IMAGE = 'current_image.png'  # Всегда одно и то же имя файла
RESULT_IMAGE = 'result_image.png' # Изображение полученное в процессе манипуляций

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

@app.route('/3d_graphics')
def three_d_graphics():
    return render_template('3dGraphics.html')

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




#  ВЕКТОРНАЯ ГРАФИКА
app.config['PROJECT_FOLDER'] = 'static/projects'
app.config['VECTOR_UPLOAD_FOLDER'] = 'static/vector_uploads'
# Ensure folders exist
Path(app.config['UPLOAD_FOLDER']).mkdir(parents=True, exist_ok=True)
Path(app.config['PROJECT_FOLDER']).mkdir(parents=True, exist_ok=True)
Path(app.config['VECTOR_UPLOAD_FOLDER']).mkdir(parents=True, exist_ok=True)

# --- Vector API endpoints ---
@app.route('/api/new_canvas', methods=['POST'])
def api_new_canvas():
    data = request.get_json() or {}
    width = data.get('width', 800)
    height = data.get('height', 600)
    units = data.get('units', 'px')
    project = new_project(width, height, units)
    return jsonify({'ok': True, 'project': project})


@app.route('/api/import_svg', methods=['POST'])
def api_import_svg():
    if 'file' not in request.files:
        return jsonify({'ok': False, 'error': 'No file uploaded'}), 400
    file = request.files['file']
    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config['VECTOR_UPLOAD_FOLDER'], filename)
    file.save(save_path)
    # Parse and provide detailed metadata and warnings for unsupported elements
    warnings = []
    metadata = {
        'layers': [],
        'groups': [],
        'gradients': [],
        'filters': [],
        'textpaths': [],
        'images': []
    }
    try:
        parser = ET.XMLParser()
        tree = ET.parse(save_path, parser=parser)
        root = tree.getroot()

        # helper to get local tag name without namespace
        def local_name(tag):
            return tag.split('}')[-1] if '}' in tag else tag

        # register common namespaces for output
        ET.register_namespace('','http://www.w3.org/2000/svg')
        ET.register_namespace('xlink','http://www.w3.org/1999/xlink')

        # collect gradients, patterns and filters from defs with some extra details
        for elem in root.findall('.//'):
            lname = local_name(elem.tag)
            if lname in ('linearGradient', 'radialGradient'):
                gid = elem.get('id') or ''
                stops = []
                for stop in elem.findall('.//'):
                    if local_name(stop.tag) == 'stop':
                        stops.append({'offset': stop.get('offset'), 'style': stop.get('style') or stop.get('stop-color')})
                metadata['gradients'].append({'id': gid, 'type': lname, 'stops': stops})
            if lname == 'filter':
                fid = elem.get('id') or ''
                # list filter primitives
                primitives = [local_name(c.tag) for c in list(elem)]
                metadata['filters'].append({'id': fid, 'primitives': primitives})
            if lname == 'pattern':
                pid = elem.get('id') or ''
                metadata['patterns'] = metadata.get('patterns', [])
                metadata['patterns'].append({'id': pid})

        # collect groups and layers (top-level groups under root)
        for g in root.findall('.//'):
            lname = local_name(g.tag)
            if lname == 'g':
                gid = g.get('id') or ''
                children = list(g)
                metadata['groups'].append({'id': gid, 'children': len(children)})

        # also detect masks/clipPaths/foreignObject
        for elem in root.findall('.//'):
            lname = local_name(elem.tag)
            if lname == 'mask':
                metadata['masks'] = metadata.get('masks', [])
                metadata['masks'].append({'id': elem.get('id') or ''})
            if lname == 'clipPath':
                metadata['clippaths'] = metadata.get('clippaths', [])
                metadata['clippaths'].append({'id': elem.get('id') or ''})
            if lname == 'foreignObject':
                metadata['foreignObjects'] = metadata.get('foreignObjects', 0) + 1

        # Find top-level groups (direct children of root)
        for child in list(root):
            if local_name(child.tag) == 'g':
                gid = child.get('id') or ''
                metadata['layers'].append({'id': gid, 'elements': len(list(child))})

        # textPaths and images
        XLINK = '{http://www.w3.org/1999/xlink}'
        for elem in root.iter():
            lname = local_name(elem.tag)
            if lname == 'textPath' or (lname == 'text' and any(local_name(c.tag) == 'textPath' for c in elem)):
                # capture some text info and href to path
                txt = ''.join(elem.itertext()).strip()
                href = ''
                if lname == 'textPath':
                    href = elem.get('href') or elem.get(XLINK + 'href') or ''
                metadata['textpaths'].append({'text': txt[:240], 'href': href})
            if lname == 'image':
                href = elem.get(XLINK + 'href') or elem.get('href') or ''
                metadata['images'].append({'href': href})

        # Warnings based on presence
        if metadata.get('images'):
            # check for embedded data URIs and external links
            for im in metadata['images']:
                href = im.get('href') or ''
                if href.startswith('data:'):
                    warnings.append('Embedded raster images (data:) detected — will remain as <image> elements.')
                elif href and (href.lower().endswith('.png') or href.lower().endswith('.jpg') or href.lower().endswith('.jpeg')):
                    warnings.append('Raster image references detected — they will be imported as <image> elements.')
        if metadata.get('foreignObjects'):
            warnings.append('foreignObject elements detected — HTML content may be converted to <image> or ignored.')
        if metadata.get('filters'):
            warnings.append('Filters present — may have limited support on export or editing.')
        if metadata.get('gradients'):
            warnings.append('Gradients present — gradient editing limited in this build.')
        if metadata.get('masks') or metadata.get('clippaths'):
            warnings.append('Mask/clipPath elements detected — these may alter appearance and have limited editable support.')

        # Convert simple foreignObject->image where possible
        converted = 0
        for fo in root.findall('.//'):
            if local_name(fo.tag) == 'foreignObject':
                # look for img tag inside
                html_img = None
                for desc in fo.iter():
                    if local_name(desc.tag).lower() == 'img' or desc.tag.lower().endswith('img'):
                        html_img = desc
                        break
                if html_img is not None:
                    src = html_img.get('src') or html_img.get('href') or ''
                    if src:
                        # create svg:image replacement
                        image_el = ET.Element('{http://www.w3.org/2000/svg}image')
                        # copy basic geometry if present
                        for a in ('x','y','width','height'):
                            v = fo.get(a)
                            if v: image_el.set(a, v)
                        # set href with xlink
                        image_el.set('{http://www.w3.org/1999/xlink}href', src)
                        parent = fo.getparent() if hasattr(fo, 'getparent') else None
                        # ET from stdlib doesn't have getparent(); find parent by scanning
                        if parent is None:
                            for p in root.findall('.//'):
                                for c in list(p):
                                    if c is fo:
                                        parent = p
                                        break
                                if parent is not None:
                                    break
                        if parent is not None:
                            parent.insert(list(parent).index(fo), image_el)
                            parent.remove(fo)
                            converted += 1
        if converted:
            warnings.append(f'Converted {converted} foreignObject(s) with <img> to SVG <image> elements.')

        # write out modified svg
        svg_text = ET.tostring(root, encoding='unicode')
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Error parsing SVG: {e}'}), 400
    # create a project from imported SVG
    project_id = str(uuid.uuid4())
    project = {
        'id': project_id,
        'width': request.form.get('width', None),
        'height': request.form.get('height', None),
        'units': request.form.get('units', 'px'),
        'svg': svg_text,
        'layers': metadata.get('layers', []),
        'metadata': metadata,
        'history': [svg_text],
        'redo': []
    }
    save_project(project_id, project)
    return jsonify({'ok': True, 'project': project, 'warnings': warnings, 'metadata': metadata})


@app.route('/api/save_vdraw', methods=['POST'])
def api_save_vdraw():
    data = request.get_json() or {}
    project_id = data.get('project_id') or str(uuid.uuid4())
    svg = data.get('svg')
    if not svg:
        return jsonify({'ok': False, 'error': 'No svg provided'}), 400
    project = load_project(project_id) or {
        'id': project_id,
        'svg': svg,
        'history': [svg],
        'redo': [],
        'layers': []
    }
    project['svg'] = svg
    project = push_history(project, svg)
    save_project(project_id, project)
    return jsonify({'ok': True, 'project_id': project_id})


@app.route('/api/load_vdraw', methods=['POST'])
def api_load_vdraw():
    data = request.get_json() or {}
    project_id = data.get('project_id')
    if not project_id:
        return jsonify({'ok': False, 'error': 'No project_id provided'}), 400
    project = load_project(project_id)
    if not project:
        return jsonify({'ok': False, 'error': 'Project not found'}), 404
    return jsonify({'ok': True, 'project': project})


@app.route('/api/export_svg', methods=['GET'])
def api_export_svg():
    project_id = request.args.get('project_id')
    project = load_project(project_id)
    if not project:
        return jsonify({'ok': False, 'error': 'Project not found'}), 404
    svg_data = project.get('svg', '')
    return send_file(io.BytesIO(svg_data.encode('utf-8')), mimetype='image/svg+xml', as_attachment=True, download_name=f'{project_id}.svg')


@app.route('/api/export_raster', methods=['POST'])
def api_export_raster():
    data = request.get_json() or {}
    project_id = data.get('project_id')
    fmt = (data.get('format') or 'PNG').upper()
    project = load_project(project_id)
    if not project:
        return jsonify({'ok': False, 'error': 'Project not found'}), 404
    svg_data = project.get('svg', '')
    if not svg_data or not svg_data.strip():
        return jsonify({'ok': False, 'error': 'Project contains empty SVG data'}), 400

    # Check cairosvg availability
    try:
        import cairosvg
    except Exception as e:
        return jsonify({'ok': False, 'error': f'cairosvg is required for export: {e}'}), 500

    def embed_external_images(svg_text):
        try:
            # Parse XML and replace external image hrefs with data URIs
            ET.register_namespace('', 'http://www.w3.org/2000/svg')
            root = ET.fromstring(svg_text)
            # namespaces
            XLINK = '{http://www.w3.org/1999/xlink}href'
            # If requests is not available, skip attempting to fetch external images
            if not REQUESTS_AVAILABLE:
                return svg_text

            for img in root.findall('.//{http://www.w3.org/2000/svg}image'):
                href = img.get('href') or img.get(XLINK) or img.get('{http://www.w3.org/1999/xlink}href')
                if not href: continue
                if href.startswith('data:'): continue
                if href.startswith('http://') or href.startswith('https://'):
                    try:
                        r = requests.get(href, timeout=8)
                        if r.status_code == 200 and r.content:
                            content_type = r.headers.get('Content-Type', 'application/octet-stream')
                            b64 = _base64.b64encode(r.content).decode('ascii')
                            data_uri = f'data:{content_type};base64,{b64}'
                            # set both href and xlink:href for compatibility
                            img.set('href', data_uri)
                            img.set(XLINK, data_uri)
                    except RequestException:
                        # ignore failures to fetch external resource; leave original href
                        continue
            return ET.tostring(root, encoding='utf-8', method='xml').decode('utf-8')
        except Exception:
            return svg_text

    try:
        out = io.BytesIO()
        # attempt to inline external raster images to avoid missing resource errors / CORS
        try:
            svg_data = embed_external_images(svg_data)
        except Exception:
            pass

        if fmt in ('PNG', 'JPEG', 'WEBP'):
            # render to PNG first
            cairosvg.svg2png(bytestring=svg_data.encode('utf-8'), write_to=out)
            out.seek(0)
            if fmt == 'PNG':
                return send_file(io.BytesIO(out.getvalue()), mimetype='image/png', as_attachment=True, download_name=f'{project_id}.png')

            # convert PNG to requested raster format using Pillow
            try:
                from PIL import Image
            except Exception as e:
                return jsonify({'ok': False, 'error': f'Pillow is required for converting to {fmt}: {e}'}), 500

            img = Image.open(out)
            out2 = io.BytesIO()
            if fmt == 'JPEG':
                img = img.convert('RGB')
                img.save(out2, format='JPEG', quality=95)
                mimetype = 'image/jpeg'; ext = 'jpg'
            else:  # WEBP
                img.save(out2, format='WEBP', quality=90)
                mimetype = 'image/webp'; ext = 'webp'
            out2.seek(0)
            return send_file(io.BytesIO(out2.getvalue()), mimetype=mimetype, as_attachment=True, download_name=f'{project_id}.{ext}')

        elif fmt == 'PDF':
            cairosvg.svg2pdf(bytestring=svg_data.encode('utf-8'), write_to=out)
            out.seek(0)
            return send_file(io.BytesIO(out.getvalue()), mimetype='application/pdf', as_attachment=True, download_name=f'{project_id}.pdf')

        elif fmt == 'SVG':
            # return raw SVG
            return send_file(io.BytesIO(svg_data.encode('utf-8')), mimetype='image/svg+xml', as_attachment=True, download_name=f'{project_id}.svg')

        else:
            # default to PNG
            cairosvg.svg2png(bytestring=svg_data.encode('utf-8'), write_to=out)
            out.seek(0)
            return send_file(io.BytesIO(out.getvalue()), mimetype='image/png', as_attachment=True, download_name=f'{project_id}.png')

    except Exception as e:
        tb = traceback.format_exc()
        print('Export error:', tb)
        return jsonify({'ok': False, 'error': f'Export failed: {e}', 'trace': tb}), 500

# --- Helper functions for projects ---
def new_project(width=800, height=600, units='px'):
    project_id = str(uuid.uuid4())
    svg = svgwrite.Drawing(size=(f"{width}{units}", f"{height}{units}"))
    # Basic root group
    svg.add(svg.g(id='layer-1'))
    svg_data = svg.tostring()
    project = {
        'id': project_id,
        'width': width,
        'height': height,
        'units': units,
        'svg': svg_data,
        'layers': ['layer-1'],
        'history': [svg_data],
        'redo': []
    }
    save_project(project_id, project)
    return project

def project_path(project_id, suffix):
    return os.path.join(app.config['PROJECT_FOLDER'], f"{project_id}.{suffix}")

def save_project(project_id, project):
    p = project_path(project_id, 'vdraw')
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(project, f, ensure_ascii=False, indent=2)

def load_project(project_id):
    p = project_path(project_id, 'vdraw')
    if not os.path.exists(p):
        return None
    with open(p, 'r', encoding='utf-8') as f:
        return json.load(f)

def push_history(project, svg_data):
    history = project.get('history', [])
    history.append(svg_data)
    # keep last 10
    project['history'] = history[-10:]
    project['redo'] = []
    return project

@app.route('/api/undo', methods=['POST'])
def api_undo():
    data = request.get_json() or {}
    project_id = data.get('project_id')
    project = load_project(project_id)

    if not project or not project.get('history'):
        return jsonify({'ok': False, 'error': 'Nothing to undo'})

    current_svg = project.get('svg')

    # перенос текущего состояния в redo
    project.setdefault('redo', []).append(current_svg)
    project['redo'] = project['redo'][-10:]

    # достаём предыдущее
    project['svg'] = project['history'].pop()

    save_project(project_id, project)
    return jsonify({'ok': True, 'svg': project['svg']})

@app.route('/api/redo', methods=['POST'])
def api_redo():
    data = request.get_json() or {}
    project_id = data.get('project_id')
    project = load_project(project_id)

    if not project or not project.get('redo'):
        return jsonify({'ok': False, 'error': 'Nothing to redo'})

    current_svg = project.get('svg')

    # текущий → history
    project.setdefault('history', []).append(current_svg)
    project['history'] = project['history'][-10:]

    # берём из redo
    project['svg'] = project['redo'].pop()

    save_project(project_id, project)
    return jsonify({'ok': True, 'svg': project['svg']})

def push_history(project, svg_data):
    history = project.get('history', [])
    history.append(svg_data)
    project['history'] = history[-10:]
    project['redo'] = []
    return project


if __name__ == '__main__':
    app.run(debug=True)