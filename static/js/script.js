document.addEventListener('DOMContentLoaded', function() {
    const qualityInput = document.querySelector('input[name="quality"]');
    const qualityValue = document.querySelector('.quality-value');
    const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
    
    if (qualityInput && qualityValue) {
        qualityInput.addEventListener('input', function() {
            qualityValue.textContent = this.value + '%';
        });
    }
    
    let image_control = document.getElementById("preview-image")
    
    
    
    let forms = document.getElementsByName("change_form")
    let form_toggles = document.getElementsByName("change_form_toggle")
    
    for (let i=0; i<forms.length; i++){
        form_toggles[i].addEventListener("click", function(e){
            current_form = forms[i]
            
            forms.forEach(element => {
                element.style = "display: none";
            });
            
            current_form.style = "display: block";
        });
        forms[i].style = "display:none"
    }
    
    
    

    let size_scale = 1;

    let rotation_angle = 0;

    let horizontal_flip = 'false';
    let vertical_flip = 'false';

    let crop_x = 0;
    let crop_y = 0;
    let crop_width = 100;
    let crop_height = 100;

    let brightness_value = 1;
    let contrast_value = 0;

    let red_channel_value = 1;
    let green_channel_value = 1;
    let blue_channel_value = 1;

    let noise_method = "nothing";
    let noise_sigma = 1;
    let salt_intensity = 0
    let pepper_intensity = 0

    let blur_method = "nothing";
    let conv_radius = 1;
    let blur_weight = 1;
    

    //Функция в которой надо отправляются аргументы в питон
    function process_image(){
        let formData = new FormData()

        formData.append('size_change', size_scale)

        formData.append('rotation_change', rotation_angle)

        formData.append('horizontal_flip_change', horizontal_flip)
        formData.append('vertical_flip_change', vertical_flip)

        formData.append('crop_x_change', crop_x)
        formData.append('crop_y_change', crop_y)
        formData.append('crop_width_change', crop_width)
        formData.append('crop_height_change', crop_height)

        formData.append('brightness_change', brightness_value)
        formData.append('contrast_change', contrast_value)

        formData.append('red_channel_change', red_channel_value)
        formData.append('green_channel_change', green_channel_value)
        formData.append('blue_channel_change', blue_channel_value)

        formData.append('noise_type_change', noise_method)
        formData.append('noise_sigma_change', noise_sigma)
        formData.append('salt_percent', salt_intensity)
        formData.append('pepper_percent', pepper_intensity)

        formData.append('blur_method_change', blur_method)
        formData.append("conv_radius_change", conv_radius)
        formData.append("blur_weight_change", blur_weight)

        fetch("/modify", {
            method: "POST",
            body: formData
        })
        .then(response => response.blob())
        .then(blob => {
            let url = URL.createObjectURL(blob)
            image_control.src = url
        })
        .catch(error => console.log(error))
    }


    //Обновление значения size_scale и вызов process_image
    let size_change_control = document.getElementById("size_change")
    size_change_control.addEventListener("input", function(e){
    
        size_scale = size_change_control.value
        document.getElementById("size_change_label").innerHTML = size_scale + "x";
            
        process_image();
    })
    

    // ПОВОРОТ
    let rotation_change_control = document.getElementById("rotation_change")
    rotation_change_control.addEventListener("input", function(e){
        rotation_angle = rotation_change_control.value
        document.getElementById("rotation_change_label").innerHTML = rotation_angle + "°";


        process_image();

    })

    
    // ОТРАЖЕНИЕ -
    let horizontal_flip_change_control = document.getElementById("horizontal_flip_change")
    horizontal_flip_change_control.addEventListener("input", function(e){
        horizontal_flip = horizontal_flip_change_control.checked;
        
        process_image();
    })
    
    let vertical_flip_change_control = document.getElementById("vertical_flip_change")
    vertical_flip_change_control.addEventListener("input", function (e) {
        vertical_flip = vertical_flip_change_control.checked;

        process_image();
    })


    // КРОП
    let crop_x_change_control = document.getElementById("x_crop_coord_change")
    crop_x_change_control.addEventListener("change", function(e){
        crop_x = crop_x_change_control.value;
        if ( crop_x < 0 || crop_x > 99 ){
            crop_x_change_control.value = clamp(crop_x, 0, 99)
            crop_x_change_control.dispatchEvent(new Event('change'))
        }

        if (parseInt(crop_width) + parseInt(crop_x) > 100){
            document.getElementById("crop_width_change").value = 100 - parseInt(crop_x)
            document.getElementById("crop_width_change").dispatchEvent(new Event('change'))
        }

        process_image()
    })
    let crop_y_change_control = document.getElementById("y_crop_coord_change")
    crop_y_change_control.addEventListener("change", function (e) {
        crop_y = crop_y_change_control.value;
        if (crop_y < 0 || crop_y > 99) {
            crop_y_change_control.value = clamp(crop_y, 0, 99)
            crop_y_change_control.dispatchEvent(new Event('change'))
        }

        if (parseInt(crop_height) + parseInt(crop_y) > 100) {
            document.getElementById("crop_height_change").value = 100 - parseInt(crop_y)
            document.getElementById("crop_height_change").dispatchEvent(new Event('change'))
        }

        process_image()
    })

    let crop_width_change_control = document.getElementById("crop_width_change")
    crop_width_change_control.addEventListener("change", function (e) {
        crop_width = crop_width_change_control.value;
        if (crop_width < 1 || crop_width > 100) {
            crop_width_change_control.value = clamp(crop_width, 1, 100)
            crop_width_change_control.dispatchEvent(new Event('change'))
        }

        if (parseInt(crop_width) + parseInt(crop_x) > 100) {
            crop_x_change_control.value = 100 - parseInt(crop_width)
            crop_x_change_control.dispatchEvent(new Event('change'))
        }

        process_image()
    })
    let crop_height_change_control = document.getElementById("crop_height_change")
    crop_height_change_control.addEventListener("change", function (e) {
        crop_height = crop_height_change_control.value;
        if (crop_height < 1 || crop_height > 100) {
            crop_height_change_control.value = clamp(crop_height, 1, 100)
            crop_height_change_control.dispatchEvent(new Event('change'))
        }

        if (parseInt(crop_height) + parseInt(crop_y) > 100) {
            crop_y_change_control.value = 100 - parseInt(crop_height)
            crop_y_change_control.dispatchEvent(new Event('change'))
        }

        process_image()
    })


    // ЯРКОСТЬ
    let brightness_value_change_control = document.getElementById("brightness_change")
    brightness_value_change_control.addEventListener("input", function(e){
        brightness_value = brightness_value_change_control.value;
        document.getElementById("brightness_change_label").innerHTML = brightness_value;


        process_image();
    })


    // КОНСТРАСТ
    let contrast_value_change_control = document.getElementById("contrast_change")
    contrast_value_change_control.addEventListener("input", function(e){
        contrast_value = contrast_value_change_control.value
        document.getElementById("contrast_change_label").innerHTML = contrast_value

        process_image()
    })


    //ЦВЕТООЙ БАЛАНС
    let red_channel_value_change_control = document.getElementById("red_channel_change")
    red_channel_value_change_control.addEventListener("input", function(e){
        red_channel_value = red_channel_value_change_control.value;
        document.getElementById("red_channel_change_label").innerHTML = red_channel_value

        process_image()
    })

    let green_channel_value_change_control = document.getElementById("green_channel_change")
    green_channel_value_change_control.addEventListener("input", function (e) {
        green_channel_value = green_channel_value_change_control.value;
        document.getElementById("green_channel_change_label").innerHTML = green_channel_value

        process_image()
    })

    let blue_channel_value_change_control = document.getElementById("blue_channel_change")
    blue_channel_value_change_control.addEventListener("input", function (e) {
        blue_channel_value = blue_channel_value_change_control.value;
        document.getElementById("blue_channel_change_label").innerHTML = blue_channel_value

        process_image()
    })


    // ШУМ
    let noise_sigma_change_control = document.getElementById("noise_sigma_change")
    noise_sigma_change_control.addEventListener("input", function(e){
        noise_sigma = noise_sigma_change_control.value;
        document.getElementById("noise_sigma_change_label").innerHTML = noise_sigma;

        process_image()
    })
    let pepper_intensity_change_control = document.getElementById("pepper_intensity_change")
    pepper_intensity_change_control.addEventListener("input", function(e){
        intensity = parseFloat(pepper_intensity_change_control.value) - 5
        if (intensity == -5){
            pepper_intensity = 0
        }
        else{
            pepper_intensity = 10 ** intensity
        }

        document.getElementById("pepper_intensity_change_label").innerHTML = pepper_intensity_change_control.value

        process_image()
    })
    let salt_intensity_change_control = document.getElementById("salt_intensity_change")
    salt_intensity_change_control.addEventListener("input", function (e) {
        intensity = parseFloat(salt_intensity_change_control.value) - 5
        console.log(intensity)
        if (intensity == -5) {
            salt_intensity = 0
        }
        else {
            salt_intensity = 10 ** intensity
        }

        document.getElementById("salt_intensity_change_label").innerHTML = salt_intensity_change_control.value

        process_image()
    })
    let noise_method_change_control = document.getElementById("noise_method")
    noise_method_change_control.addEventListener("change", function(e){
        noise_method = noise_method_change_control.options[noise_method_change_control.selectedIndex].value;
        if (noise_method == "nothing"){
            document.getElementById("gauss_noise_form").style = "display: none"
            document.getElementById("salt_pepper_noise_form").style = "display: none"
        }
        if (noise_method == "gauss") {
            document.getElementById("gauss_noise_form").style = "display: box"
            document.getElementById("salt_pepper_noise_form").style = "display: none"
        }
        if (noise_method == "salt_pepper") {
            document.getElementById("gauss_noise_form").style = "display: none"
            document.getElementById("salt_pepper_noise_form").style = "display: box"
        }

        process_image()
    })


    // РАЗМЫТИЕ
    let conv_radius_change_control = document.getElementById("conv_radius_change")
    conv_radius_change_control.addEventListener("input", function(e){
        conv_radius = conv_radius_change_control.value;
        document.getElementById("conv_radius_change_label").innerHTML = conv_radius
    
        process_image()
    })
    
    let blur_weight_change_control = document.getElementById("blur_weight_change")
    blur_weight_change_control.addEventListener("input", function (e) {
        blur_weight = blur_weight_change_control.value;
        document.getElementById("blur_weight_change_label").innerHTML = blur_weight
    
        process_image()
    })

    let blur_method_control = document.getElementById("blur_method")
    blur_method_control.addEventListener("change", function(e){
        blur_method = blur_method_control.options[blur_method_control.selectedIndex].value;
        if (blur_method == "nothing"){
            conv_radius_change_control.disabled = true;
            blur_weight_change_control.disabled = true;
        }
        if (blur_method == "gauss") {
            conv_radius_change_control.disabled = false;
            blur_weight_change_control.disabled = false;
        }
        if (blur_method == "median" || blur_method == "mean") {
            conv_radius_change_control.disabled = false;
            blur_weight_change_control.disabled = true;
        }

        process_image()
    })

});

