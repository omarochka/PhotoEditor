document.addEventListener('DOMContentLoaded', function() {
    const qualityInput = document.querySelector('input[name="quality"]');
    const qualityValue = document.querySelector('.quality-value');
    
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
    
    //Функция в которой надо отправляются аргументы в питон
    function process_image(){
        let formData = new FormData()

        formData.append('size_change', size_scale)
        formData.append('rotation_change', rotation_angle)

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
    
    
    let rotation_change_control = document.getElementById("rotation_change")
    rotation_change_control.addEventListener("input", function(e){
        rotation_angle = rotation_change_control.value
        document.getElementById("rotation_change_label").innerHTML = rotation_angle;


        process_image();

    })

    console.log("Working")
});

