document.addEventListener('DOMContentLoaded', function() {
    const qualityInput = document.querySelector('input[name="quality"]');
    const qualityValue = document.querySelector('.quality-value');
    
    if (qualityInput && qualityValue) {
        qualityInput.addEventListener('input', function() {
            qualityValue.textContent = this.value + '%';
        });
    }
});