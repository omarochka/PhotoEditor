(function(){
    // Override or provide newCanvas to create canvas on server
    async function postJSON(url, data){
        const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)});
        return res.json();
    }

    window.newCanvas = async function(w=1024,h=768,units='px'){
        try{
            const r = await postJSON('/api/new_canvas', {width: w, height: h, units: units});
            if(!r) throw new Error('No response');
            if(r.ok){
                // set global projectId if present
                try{ window.projectId = r.project.id; }catch(e){}
                // parse svg string and copy children into current svg element
                const svg = document.getElementById('svgCanvas');
                if(!svg) return;
                try{
                    const tmp = document.createElement('div'); tmp.innerHTML = r.project.svg;
                    const tmpSvg = tmp.querySelector('svg');
                    if(tmpSvg){
                        ['width','height','viewBox','xmlns'].forEach(a=>{ if(tmpSvg.hasAttribute(a)) svg.setAttribute(a, tmpSvg.getAttribute(a)); });
                        svg.innerHTML = tmpSvg.innerHTML;
                    } else {
                        svg.innerHTML = r.project.svg;
                    }
                }catch(e){ svg.innerHTML = r.project.svg; }

                const pi = document.getElementById('project-info'); if(pi) pi.textContent = 'Project: ' + (r.project.id || 'new');
                // if no project-info element exists, create one in the toolbar
                if(!document.getElementById('project-info')){
                    const toolbar = document.querySelector('.toolbar') || document.body;
                    const info = document.createElement('div');
                    info.id = 'project-info';
                    info.style.marginLeft = '12px';
                    info.style.marginTop = '6px';
                    info.style.color = '#666';
                    info.textContent = 'Project: ' + (r.project.id || 'new');
                    toolbar.appendChild(info);
                }
                else {
                    const pi2 = document.getElementById('project-info'); if(pi2) pi2.textContent = 'Project: ' + (r.project.id || 'new');
                }
                // call pushHistory and refreshLayers if available
                try{ if(typeof window.pushHistory === 'function') window.pushHistory(); }catch(e){}
                try{ if(typeof window.refreshLayers === 'function') window.refreshLayers(); }catch(e){}
                commitHistory();
                return r;
            } else {
                alert('Server error creating canvas: ' + (r.error||'Unknown'));
                return r;
            }
        }catch(err){
            alert('Failed to create canvas: ' + err.message);
            console.error(err);
        }
    };

    // Also wire canvas-apply directly if present (in case template doesn't call newCanvas)
    document.addEventListener('DOMContentLoaded', ()=>{
        // support different templates: canvas-apply or createCanvasBtn
        const apply = document.getElementById('canvas-apply');
        if(apply){
            apply.addEventListener('click', async function(e){
                e.preventDefault();
                const w = parseInt(document.getElementById('canvas-width').value) || 1024;
                const h = parseInt(document.getElementById('canvas-height').value) || 768;
                const units = document.getElementById('canvas-units') ? document.getElementById('canvas-units').value : 'px';
                await window.newCanvas(w,h,units);
                try{ if(typeof window.showToolPanel === 'function') window.showToolPanel('any'); }catch(e){}
            });
        }

        const createBtn = document.getElementById('createCanvasBtn');
        if(createBtn){
            createBtn.addEventListener('click', async (e)=>{
                e.preventDefault();
                const w = parseInt(document.getElementById('canvasWidth').value) || 1024;
                const h = parseInt(document.getElementById('canvasHeight').value) || 768;
                const units = document.getElementById('canvasUnits') ? document.getElementById('canvasUnits').value : 'px';
                await window.newCanvas(w,h,units);
                const form = document.getElementById('newCanvasForm'); if(form) form.style.display = 'none';
            });
        }

        const newBtn = document.getElementById('newCanvasBtn');
        if(newBtn){
            newBtn.addEventListener('click', (e)=>{
                e.preventDefault();
                const form = document.getElementById('newCanvasForm'); if(form) form.style.display = 'block';
            });
        }

        const cancelBtn = document.getElementById('cancelCanvasBtn');
        if(cancelBtn){ cancelBtn.addEventListener('click', (e)=>{ e.preventDefault(); const form = document.getElementById('newCanvasForm'); if(form) form.style.display = 'none'; }); }

        // Import SVG wiring
        const importBtn = document.getElementById('importSvgBtn'); if(importBtn) importBtn.addEventListener('click', (e)=>{ e.preventDefault(); const f = document.getElementById('importSvgForm'); const layers = document.getElementById('layersPanel'); if(layers) layers.style.display = 'none'; if(f) f.style.display = 'block'; });
        const loadSvgBtn = document.getElementById('loadSvgBtn');
        const svgFileInput = document.getElementById('svgFileInput');
        const cancelImportBtn = document.getElementById('cancelImportSvgBtn');
        const preview = document.getElementById('svgImportPreview');
        const warningsBox = document.getElementById('svgImportWarnings');

        if(cancelImportBtn) cancelImportBtn.addEventListener('click', (e)=>{ e.preventDefault(); const f = document.getElementById('importSvgForm'); const layers = document.getElementById('layersPanel'); if(f) f.style.display = 'none'; if(preview) preview.innerHTML=''; if(warningsBox) warningsBox.innerHTML=''; if(layers) layers.style.display = 'block'; });

        if(loadSvgBtn && svgFileInput){
            loadSvgBtn.addEventListener('click', async function(e){
                e.preventDefault();
                if(!svgFileInput.files || svgFileInput.files.length===0){ alert('Выберите SVG файл'); return; }
                const file = svgFileInput.files[0];
                const fd = new FormData(); fd.append('file', file);
                try{
                    const res = await fetch('/api/import_svg', { method: 'POST', body: fd });
                    const data = await res.json();
                    if(!data.ok){ alert('Import failed: ' + (data.error||'Unknown')); return; }
                    // show preview (inject SVG into sidebar preview area)
                    // notify other scripts about the import result
                    try{
                        if(typeof window.onSvgImported === 'function'){
                            window.onSvgImported(data);
                        }
                        document.dispatchEvent(new CustomEvent('svgImported', { detail: data }));
                    }catch(e){ console.warn('svgImported notification failed', e); }
                    // show warnings
                    if(warningsBox){
                        warningsBox.innerHTML = '';
                        if(data.warnings && data.warnings.length){
                            const ul = document.createElement('ul');
                            data.warnings.forEach(w=>{ const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
                            warningsBox.appendChild(ul);
                        }
                    }
                    // add an 'Apply' button to import the SVG into canvas and show preview
                    if(preview){
                        preview.innerHTML = data.project.svg || '';
                        let applyBtn = document.getElementById('applyImportBtn');
                        if(!applyBtn){ applyBtn = document.createElement('button'); applyBtn.id = 'applyImportBtn'; applyBtn.textContent = 'Импортировать в холст'; preview.parentNode.insertBefore(applyBtn, preview.nextSibling); }
                        applyBtn.onclick = function(){
                            const svg = document.getElementById('svgCanvas'); if(!svg) return;
                            try{
                                const tmp = document.createElement('div'); tmp.innerHTML = data.project.svg;
                                const tmpSvg = tmp.querySelector('svg');
                                if(tmpSvg){ ['width','height','viewBox','xmlns'].forEach(a=>{ if(tmpSvg.hasAttribute(a)) svg.setAttribute(a, tmpSvg.getAttribute(a)); }); svg.innerHTML = tmpSvg.innerHTML; }
                                else { svg.innerHTML = data.project.svg; }
                            }catch(err){ svg.innerHTML = data.project.svg; }
                            // set project id
                            try{ window.projectId = data.project.id; }catch(e){}
                            // update UI
                            const f = document.getElementById('importSvgForm'); if(f) f.style.display = 'none';
                            const layers = document.getElementById('layersPanel'); if(layers) layers.style.display = 'block';
                            if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){}
                            if(typeof window.refreshLayers === 'function') try{ window.refreshLayers(); }catch(e){}
                            commitHistory();
                            // notify listeners that svg was applied to canvas
                            try{
                                if(typeof window.onSvgApplied === 'function') window.onSvgApplied(data);
                                document.dispatchEvent(new CustomEvent('svgApplied', { detail: data }));
                            }catch(e){ console.warn('svgApplied notification failed', e); }
                        };
                    }
                }catch(err){ alert('Ошибка импорта: ' + err.message); console.error(err); }
            });
        }

        // Layer panel buttons wiring
        const createLayerBtn = document.getElementById('createLayerBtn'); if(createLayerBtn) createLayerBtn.addEventListener('click', ()=>{ const n = prompt('Имя слоя', 'layer'); window.createLayer(n); });
        const renameLayerBtn = document.getElementById('renameLayerBtn'); if(renameLayerBtn) renameLayerBtn.addEventListener('click', ()=>{ window.renameLayer(); });
        const deleteLayerBtn = document.getElementById('deleteLayerBtn'); if(deleteLayerBtn) deleteLayerBtn.addEventListener('click', ()=>{ window.deleteSelected(); });
        const moveUpBtn = document.getElementById('moveUpBtn'); if(moveUpBtn) moveUpBtn.addEventListener('click', ()=>{ window.moveLayer('up'); });
        const moveDownBtn = document.getElementById('moveDownBtn'); if(moveDownBtn) moveDownBtn.addEventListener('click', ()=>{ window.moveLayer('down'); });
        const moveTopBtn = document.getElementById('moveTopBtn'); if(moveTopBtn) moveTopBtn.addEventListener('click', ()=>{ window.moveLayer('top'); });
        const moveBottomBtn = document.getElementById('moveBottomBtn'); if(moveBottomBtn) moveBottomBtn.addEventListener('click', ()=>{ window.moveLayer('bottom'); });
        const groupBtn = document.getElementById('groupBtn'); if(groupBtn) groupBtn.addEventListener('click', ()=>{ window.groupSelection(); });
        const ungroupBtn = document.getElementById('ungroupBtn'); if(ungroupBtn) ungroupBtn.addEventListener('click', ()=>{ window.ungroupSelection(); });

        const alignLeftBtn = document.getElementById('alignLeftBtn'); if(alignLeftBtn) alignLeftBtn.addEventListener('click', ()=>{ window.alignSelected('left'); });
        const alignCenterBtn = document.getElementById('alignCenterBtn'); if(alignCenterBtn) alignCenterBtn.addEventListener('click', ()=>{ window.alignSelected('center'); });
        const alignRightBtn = document.getElementById('alignRightBtn'); if(alignRightBtn) alignRightBtn.addEventListener('click', ()=>{ window.alignSelected('right'); });
        const alignTopBtn = document.getElementById('alignTopBtn'); if(alignTopBtn) alignTopBtn.addEventListener('click', ()=>{ window.alignSelected('top'); });
        const alignMiddleBtn = document.getElementById('alignMiddleBtn'); if(alignMiddleBtn) alignMiddleBtn.addEventListener('click', ()=>{ window.alignSelected('middle'); });
        const alignBottomBtn = document.getElementById('alignBottomBtn'); if(alignBottomBtn) alignBottomBtn.addEventListener('click', ()=>{ window.alignSelected('bottom'); });

        const distributeHBtn = document.getElementById('distributeHBtn'); if(distributeHBtn) distributeHBtn.addEventListener('click', ()=>{ window.distributeSelected('h'); });
        const distributeVBtn = document.getElementById('distributeVBtn'); if(distributeVBtn) distributeVBtn.addEventListener('click', ()=>{ window.distributeSelected('v'); });

        // Primitive tool wiring: show primitive settings, hide layers
        const toolButtonsMap = {
            rect: document.getElementById('tool-rect'),
            ellipse: document.getElementById('tool-ellipse'),
            line: document.getElementById('tool-line'),
            polyline: document.getElementById('tool-polyline'),
            polygon: document.getElementById('tool-polygon'),
            star: document.getElementById('tool-star'),
            text: document.getElementById('tool-text')
        };

        Object.entries(toolButtonsMap).forEach(([tool, btn])=>{
            if(!btn) return;
            btn.addEventListener('click', (e)=>{ e.preventDefault(); showPrimitiveForm(tool); });
        });

        const addPrimitiveBtn = document.getElementById('addPrimitiveBtn');
        const cancelPrimitiveBtn = document.getElementById('cancelPrimitiveBtn');
        if(cancelPrimitiveBtn) cancelPrimitiveBtn.addEventListener('click', (e)=>{ e.preventDefault(); const f = document.getElementById('primitive-form'); const layers = document.getElementById('layersPanel'); if(f) f.style.display = 'none'; if(layers) layers.style.display = 'block'; });
        if(addPrimitiveBtn) addPrimitiveBtn.addEventListener('click', (e)=>{ e.preventDefault(); handleAddPrimitive(); });

        // Drag-to-move for selected element
        const svgCanvas = document.getElementById('svgCanvas');
        let isDragging = false, dragTarget = null, dragStart = null, baseTransform = '';
        if(svgCanvas){
            svgCanvas.addEventListener('mousedown', function(evt){
                const sel = window.selectedElement;
                if(!sel) return;
                // ensure click is on selected element or its child
                if(!(evt.target === sel || sel.contains(evt.target))) return;
                isDragging = true; dragTarget = sel;
                const pt = svgCanvas.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
                const inv = svgCanvas.getScreenCTM().inverse();
                const loc = pt.matrixTransform(inv);
                dragStart = {x: loc.x, y: loc.y};
                baseTransform = dragTarget.getAttribute('transform') || '';
                // store parsed original transform so translations apply in global coords
                try{ dragTarget._origTransformState = parseTransform(baseTransform); }catch(e){ dragTarget._origTransformState = {translate:{x:0,y:0},scale:{x:1,y:1},rotate:{angle:0,cx:0,cy:0},skew:{x:0,y:0}}; }
                evt.preventDefault();
            });
            window.addEventListener('mousemove', function(evt){
                if(!isDragging || !dragTarget) return;
                const pt = svgCanvas.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
                const inv = svgCanvas.getScreenCTM().inverse();
                const loc = pt.matrixTransform(inv);
                const dx = loc.x - dragStart.x, dy = loc.y - dragStart.y;
                try{
                    const orig = dragTarget._origTransformState || parseTransform(baseTransform);
                    // copy
                    const st = { translate: { x: (orig.translate&&orig.translate.x)||0, y: (orig.translate&&orig.translate.y)||0 }, scale: { x: (orig.scale&&orig.scale.x)||1, y: (orig.scale&&orig.scale.y)||1 }, rotate: { angle: (orig.rotate&&orig.rotate.angle)||0, cx: (orig.rotate&&orig.rotate.cx)||0, cy: (orig.rotate&&orig.rotate.cy)||0 }, skew: { x: (orig.skew&&orig.skew.x)||0, y: (orig.skew&&orig.skew.y)||0 } };
                    st.translate.x = (st.translate.x || 0) + dx;
                    st.translate.y = (st.translate.y || 0) + dy;
                    setTransformFromState(dragTarget, st);
                }catch(e){
                    // fallback to appending translate
                    dragTarget.setAttribute('transform', baseTransform + ' translate(' + dx + ',' + dy + ')');
                }
            });
            window.addEventListener('mouseup', function(evt){ if(isDragging){ isDragging=false; dragTarget=null; dragStart=null; baseTransform=''; commitHistory(); if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){} } });
        }

        // Export form trigger and handlers
        const openExportBtn = document.getElementById('openExportBtn'); if(openExportBtn) openExportBtn.addEventListener('click', (e)=>{ e.preventDefault(); const f = document.getElementById('exportForm'); const layers = document.getElementById('layersPanel'); if(layers) layers.style.display = 'none'; if(f) f.style.display = 'block'; });
        const cancelExportBtn = document.getElementById('cancelExportBtn'); if(cancelExportBtn) cancelExportBtn.addEventListener('click', (e)=>{ e.preventDefault(); const f = document.getElementById('exportForm'); const layers = document.getElementById('layersPanel'); if(f) f.style.display = 'none'; if(layers) layers.style.display = 'block'; });
        const doExportBtn = document.getElementById('doExportBtn'); if(doExportBtn) doExportBtn.addEventListener('click', async (e)=>{
            e.preventDefault();
            const sel = document.querySelector('input[name="exportFormat"]:checked');
            const fmt = sel ? sel.value : 'PNG';
            try{
                if(fmt === 'VDRAW'){
                    await clientSaveVdraw();
                } else if(fmt === 'SVG'){
                    await clientExportSVG();
                } else if(['PNG','PDF','JPEG','WEBP'].includes(fmt)){
                    const ok = await exportClient(fmt);
                    if(!ok) alert('Клиентский экспорт не удался. Проверьте SVG на внешние изображения или попробуйте другой формат.');
                } else {
                    alert('Неподдерживаемый формат: ' + fmt);
                }
            }catch(err){ console.error(err); alert('Ошибка экспорта: ' + (err.message||err)); }
            const f = document.getElementById('exportForm'); const layers = document.getElementById('layersPanel'); if(f) f.style.display = 'none'; if(layers) layers.style.display = 'block';
        });

        // Right-panel tabs (Layers / Inspector)
        const tabLayers = document.getElementById('tab-layers');
        const tabInspector = document.getElementById('tab-inspector');
        function showRightTab(name){
    const layers = document.getElementById('layersPanel');
    const inspector = document.getElementById('inspectorPanel');
    const animationPanel = document.getElementById('animationPanel');
    const gradientPanel = document.getElementById('gradientPanel');
    
    // Скрыть все панели
    if(layers) layers.style.display = 'none';
    if(inspector) inspector.style.display = 'none';
    if(animationPanel) animationPanel.style.display = 'none';
    if(gradientPanel) gradientPanel.style.display = 'none';
    
    // Обновить классы вкладок
    document.querySelectorAll('.right-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Показать выбранную панель
    if(name === 'inspector'){
        if(inspector) inspector.style.display = 'block';
        const tabInspector = document.getElementById('tab-inspector');
        if(tabInspector) tabInspector.classList.add('active');
    } else if(name === 'layers') {
        if(layers) layers.style.display = 'block';
        const tabLayers = document.getElementById('tab-layers');
        if(tabLayers) tabLayers.classList.add('active');
    } else if(name === 'animation') {
        if(animationPanel) animationPanel.style.display = 'block';
        const tabAnimation = document.getElementById('tab-animation');
        if(tabAnimation) tabAnimation.classList.add('active');
    } else if(name === 'gradient') {
        if(gradientPanel) gradientPanel.style.display = 'block';
        const tabGradient = document.getElementById('tab-gradient');
        if(tabGradient) tabGradient.classList.add('active');
        // Обновить контент градиентов
        if(window.gradientSystem && typeof window.gradientSystem.updateGradientContent === 'function') {
            window.gradientSystem.updateGradientContent();
        }
    }
}
        if(tabLayers) tabLayers.addEventListener('click', (e)=>{ e.preventDefault(); showRightTab('layers'); });
        if(tabInspector) tabInspector.addEventListener('click', (e)=>{ e.preventDefault(); showRightTab('inspector'); });
        // (removed showInspectorBelowLayers) prefer separate tabs; inspector not visible under layers

        // expose helper
        window.showRightTab = showRightTab;
        // default show layers (inspector hidden)
        showRightTab('layers');
        if(typeof updateToolbarButtonsState === 'function') updateToolbarButtonsState();
    });

    // Layers / selection helpers
    window.selectedElement = null;

    function updateToolbarButtonsState(){
        const sels = getSelectedElements();
        const single = sels.length === 1;
        const multi = sels.length >= 2;
        const any = sels.length > 0;
        // buttons that require selection
        const renameBtn = document.getElementById('renameLayerBtn'); if(renameBtn) renameBtn.disabled = !single;
        const deleteBtn = document.getElementById('deleteLayerBtn'); if(deleteBtn) deleteBtn.disabled = !any;
        const groupBtn = document.getElementById('groupBtn'); if(groupBtn) groupBtn.disabled = !(sels.length >= 2);
        const ungroupBtn = document.getElementById('ungroupBtn'); if(ungroupBtn){
            let ok = false; if(sels.length===1){ const el = sels[0]; if(el && el.tagName && el.tagName.toLowerCase()==='g') ok = true; }
            ungroupBtn.disabled = !ok;
        }
        // alignment: require 2+ elements
        ['alignLeftBtn','alignCenterBtn','alignRightBtn','alignTopBtn','alignMiddleBtn','alignBottomBtn'].forEach(id=>{ const b = document.getElementById(id); if(b) b.disabled = !multi; });
        // distribute require 3+
        const d1 = document.getElementById('distributeHBtn'); if(d1) d1.disabled = !(sels.length>=3);
        const d2 = document.getElementById('distributeVBtn'); if(d2) d2.disabled = !(sels.length>=3);
    }

    // --- Save / Export helpers ---
    async function getCurrentSvgString(){
        const svg = document.getElementById('svgCanvas'); if(!svg) return '';
        // ensure xmlns
        if(!svg.getAttribute('xmlns')) svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svg);
        // Add XML prologue
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;
    }

    // Save project to server (.vdraw) then offer download of .vdraw JSON
    window.saveVdraw = async function(){
        try{
            const svgText = await getCurrentSvgString();
            const payload = { project_id: window.projectId || null, svg: svgText };
            const resp = await fetch('/api/save_vdraw', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            const data = await resp.json();
            if(!data.ok){ alert('Save failed: ' + (data.error||'unknown')); return; }
            const pid = data.project_id || window.projectId;
            // fetch saved project and download as .vdraw
            const loadResp = await fetch('/api/load_vdraw', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ project_id: pid }) });
            const projectData = await loadResp.json();
            if(!projectData.ok){ alert('Failed to load project for download'); return; }
            const blob = new Blob([JSON.stringify(projectData.project, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (pid || 'project') + '.vdraw'; document.body.appendChild(a); a.click(); a.remove();
            // update global id
            window.projectId = pid;
            const pi = document.getElementById('project-info'); if(pi) pi.textContent = 'Project: ' + pid;
        }catch(err){ alert('Ошибка сохранения проекта: ' + err.message); console.error(err); }
    };

    // Export SVG file using server endpoint (forces download)
    window.exportSVG = async function(){
        try{
            const pid = window.projectId;
            if(!pid){ // try to save first
                await window.saveVdraw();
            }
            const project_id = window.projectId;
            const url = '/api/export_svg?project_id=' + encodeURIComponent(project_id || '');
            // trigger download
            const res = await fetch(url);
            if(!res.ok){ const j = await res.json().catch(()=>({})); alert('Export SVG failed: ' + (j.error||res.statusText)); return; }
            const blob = await res.blob();
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (project_id || 'project') + '.svg'; document.body.appendChild(a); a.click(); a.remove();
        }catch(err){ alert('Ошибка экспорта SVG: ' + err.message); console.error(err); }
    };

    // Export raster (PNG) via server
    window.exportPNG = async function(){
        try{
            const pid = window.projectId;
            if(!pid){ await window.saveVdraw(); }
            const project_id = window.projectId;
            const res = await fetch('/api/export_raster', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ project_id: project_id, format: 'PNG' }) });
            if(!res.ok){ const j = await res.json().catch(()=>({})); alert('Export PNG failed: ' + (j.error||res.statusText)); return; }
            const blob = await res.blob();
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (project_id || 'project') + '.png'; document.body.appendChild(a); a.click(); a.remove();
        }catch(err){ alert('Ошибка экспорта PNG: ' + err.message); console.error(err); }
    };

    async function exportRaster(fmt){
        // Try client-side export first (avoids server-side dependencies and 500 errors).
        try{
            const clientOk = await exportClient(fmt).catch(()=>false);
            if(clientOk) return;
        }catch(e){ /* continue to server fallback */ }

        try{
            if(!window.projectId){ await window.saveVdraw(); }
            const project_id = window.projectId;
            const res = await fetch('/api/export_raster', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ project_id: project_id, format: fmt }) });
            if(!res.ok){ const j = await res.json().catch(()=>({})); alert('Export failed: ' + (j.error||res.statusText)); return; }
            const blob = await res.blob();
            const ext = (fmt==='JPEG')? 'jpg' : (fmt==='WEBP')? 'webp' : (fmt==='PDF')? 'pdf' : 'png';
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (project_id || 'project') + '.' + ext; document.body.appendChild(a); a.click(); a.remove();
        }catch(err){ alert('Ошибка экспорта: ' + err.message); console.error(err); }
    }

    // Client-side export: draw SVG to canvas and save raster or PDF
    async function exportClient(fmt){
        try{
            const svgString = await getCurrentSvgString();
            // Create image from SVG
            const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            // Attempt to avoid tainting by using same-origin data URL
            img.crossOrigin = 'anonymous';

            return await new Promise((resolve, reject)=>{
                img.onload = async function(){
                    try{
                        // Determine target size from SVG element
                        const svgEl = document.getElementById('svgCanvas');
                        let w = parseInt(svgEl.getAttribute('width')) || svgEl.viewBox.baseVal.width || svgEl.getBoundingClientRect().width || img.width;
                        let h = parseInt(svgEl.getAttribute('height')) || svgEl.viewBox.baseVal.height || svgEl.getBoundingClientRect().height || img.height;
                        // Create canvas
                        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h));
                        const ctx = canvas.getContext('2d');
                        // white background for JPEG
                        if(fmt === 'JPEG'){
                            ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width, canvas.height);
                        }
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        if(fmt === 'PDF'){
                            // use jsPDF to generate PDF
                            let jsPDFConstructor = null;
                            if(window.jspdf && window.jspdf.jsPDF) jsPDFConstructor = window.jspdf.jsPDF;
                            else if(window.jspdf && window.jspdf.default && window.jspdf.default.jsPDF) jsPDFConstructor = window.jspdf.default.jsPDF;
                            if(!jsPDFConstructor && window.jsPDF) jsPDFConstructor = window.jsPDF;
                            if(!jsPDFConstructor){
                                console.warn('jsPDF not available');
                                resolve(false);
                                return;
                            }
                            const imgData = canvas.toDataURL('image/png');
                            // A4 portrait size in mm
                            const pdf = new jsPDFConstructor({unit: 'pt', format: [canvas.width, canvas.height]});
                            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
                            const blob = pdf.output('blob');
                            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (window.projectId||'project') + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
                            resolve(true);
                            return;
                        }

                        // raster formats
                        const mime = (fmt === 'JPEG') ? 'image/jpeg' : (fmt === 'WEBP') ? 'image/webp' : 'image/png';
                        canvas.toBlob(function(blob){
                            if(!blob){ resolve(false); return; }
                            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); const ext = (fmt==='JPEG')? 'jpg': (fmt==='WEBP')? 'webp':'png'; a.download = (window.projectId||'project') + '.' + ext; document.body.appendChild(a); a.click(); a.remove();
                            resolve(true);
                        }, mime, 0.95);
                    }catch(err){ console.error('exportClient error', err); resolve(false); }
                    finally{ URL.revokeObjectURL(url); }
                };
                img.onerror = function(e){ URL.revokeObjectURL(url); resolve(false); };
                img.src = url;
            });
        }catch(err){ console.error('exportClient outer error', err); return false; }
    }

    // Client-side save .vdraw (JSON) without server
    async function clientSaveVdraw(){
        try{
            const svgText = await getCurrentSvgString();
            const project = {
                id: window.projectId || null,
                svg: svgText,
                exported_at: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (project.id || 'project') + '.vdraw'; document.body.appendChild(a); a.click(); a.remove();
        }catch(err){ alert('Ошибка сохранения .vdraw: ' + err.message); console.error(err); }
    }

    // Client-side export SVG
    async function clientExportSVG(){
        try{
            const svgText = await getCurrentSvgString();
            const blob = new Blob([svgText], { type: 'image/svg+xml' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (window.projectId || 'project') + '.svg'; document.body.appendChild(a); a.click(); a.remove();
        }catch(err){ alert('Ошибка экспорта SVG: ' + err.message); console.error(err); }
    }

    // Helper: ensure element has id
    function ensureIdGlobal(el, prefix){
        if(!el) return null;
        if(!el.id){ el.id = (prefix||'el') + '_' + Math.random().toString(36).substr(2,9); }
        return el.id;
    }

    // Show primitive settings form for chosen tool
    function showPrimitiveForm(tool){
        const form = document.getElementById('primitive-form'); if(!form) return;
        const title = document.getElementById('form-title'); if(title) title.textContent = 'Добавить: ' + tool;
        const fields = document.getElementById('form-fields'); if(!fields) return;
        // common controls
        const common = `
            <label>Заливка: <input type="color" id="p_fill" value="#ffcc00"></label><br>
            <label>Обводка: <input type="color" id="p_stroke" value="#000000"></label><br>
            <label>Толщина: <input type="number" id="p_stroke_width" value="2" min="0" style="width:80px"></label><br>
            <label>Скругление углов (rect only): <input type="number" id="p_rx" value="6" min="0" style="width:80px"></label><br>
            <label>Шаблон штриха (dash): <input type="text" id="p_dash" placeholder="e.g. 5,3"></label><br>
            <label>Непрозрачность: <input type="range" id="p_opacity" min="0" max="1" step="0.05" value="1"></label><br>
        `;
        let specific = '';
        if(tool === 'rect'){
            specific = `<label>Ширина: <input type="number" id="p_w" value="120"></label><br><label>Высота: <input type="number" id="p_h" value="80"></label><br>`;
        } else if(tool === 'ellipse'){
            specific = `<label>Радиус X: <input type="number" id="p_rxval" value="60"></label><br><label>Радиус Y: <input type="number" id="p_ryval" value="40"></label><br>`;
        } else if(tool === 'line'){
            specific = `<label>X1: <input type="number" id="p_x1" value="10"></label> <label>Y1: <input type="number" id="p_y1" value="10"></label><br><label>X2: <input type="number" id="p_x2" value="130"></label> <label>Y2: <input type="number" id="p_y2" value="80"></label><br>`;
        } else if(tool === 'polyline' || tool === 'polygon'){
            specific = `<label>Точки (x,y разделённые пробелом):<br><textarea id="p_points" rows="3">10,10 130,10 130,90</textarea></label><br>`;
        } else if(tool === 'star'){
            specific = `<label>Число лучей: <input type="number" id="p_points_count" value="5" min="3" style="width:80px"></label><br><label>Внешний радиус: <input type="number" id="p_rout" value="50"></label><br><label>Внутренний радиус: <input type="number" id="p_rin" value="25"></label><br>`;
        } else if(tool === 'text'){
            specific = `<label>Текст:<br><input type="text" id="p_text_val" value="Hello"></label><br><label>Размер шрифта: <input type="number" id="p_font_size" value="24" style="width:80px"></label><br>`;
        }
        fields.innerHTML = specific + common;
        form.style.display = 'block';
        // hide layers panel
        const layers = document.getElementById('layersPanel'); if(layers) layers.style.display = 'none';
        // remember current tool
        window._currentPrimitiveTool = tool;
    }

    // Create primitive from form values
    function handleAddPrimitive(){
        const tool = window._currentPrimitiveTool || 'rect';
        const svg = document.getElementById('svgCanvas'); if(!svg) return;
        function get(id){ const el = document.getElementById(id); return el ? el.value : null; }
        const fill = get('p_fill') || 'none';
        const stroke = get('p_stroke') || 'black';
        const sw = get('p_stroke_width') || 1;
        const dash = get('p_dash') || '';
        const opacity = get('p_opacity') || 1;
        let el = null;
        if(tool === 'rect'){
            const w = parseFloat(get('p_w')||120); const h = parseFloat(get('p_h')||80);
            el = document.createElementNS('http://www.w3.org/2000/svg','rect'); el.setAttribute('x',10); el.setAttribute('y',10); el.setAttribute('width',w); el.setAttribute('height',h);
            const rx = parseFloat(get('p_rx')||0); if(rx) el.setAttribute('rx', rx);
        } else if(tool === 'ellipse'){
            const rx = parseFloat(get('p_rxval')||60); const ry = parseFloat(get('p_ryval')||40);
            el = document.createElementNS('http://www.w3.org/2000/svg','ellipse'); el.setAttribute('cx', 60); el.setAttribute('cy', 40); el.setAttribute('rx', rx); el.setAttribute('ry', ry);
        } else if(tool === 'line'){
            const x1 = get('p_x1')||10, y1 = get('p_y1')||10, x2 = get('p_x2')||120, y2 = get('p_y2')||80;
            el = document.createElementNS('http://www.w3.org/2000/svg','line'); el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2);
        } else if(tool === 'polyline'){
            const pts = get('p_points') || '10,10 130,10 130,90'; el = document.createElementNS('http://www.w3.org/2000/svg','polyline'); el.setAttribute('points', pts);
        } else if(tool === 'polygon'){
            const pts = get('p_points') || '10,10 130,10 130,90'; el = document.createElementNS('http://www.w3.org/2000/svg','polygon'); el.setAttribute('points', pts);
        } else if(tool === 'star'){
            const cnt = parseInt(get('p_points_count')||5); const rout = parseFloat(get('p_rout')||50); const rin = parseFloat(get('p_rin')||25);
            // build star polygon centered at (rout+10,rout+10)
            const cx = rout + 10, cy = rout + 10; let pts = [];
            for(let i=0;i<cnt;i++){
                const ang = Math.PI*2*i/cnt - Math.PI/2; const x1 = cx + Math.cos(ang)*rout; const y1 = cy + Math.sin(ang)*rout; pts.push(x1+','+y1);
                const ang2 = ang + Math.PI/cnt; const x2 = cx + Math.cos(ang2)*rin; const y2 = cy + Math.sin(ang2)*rin; pts.push(x2+','+y2);
            }
            el = document.createElementNS('http://www.w3.org/2000/svg','polygon'); el.setAttribute('points', pts.join(' '));
        } else if(tool === 'text'){
            const txt = get('p_text_val') || 'Text'; const size = get('p_font_size') || 24; el = document.createElementNS('http://www.w3.org/2000/svg','text'); el.setAttribute('x', 10); el.setAttribute('y', 40); el.setAttribute('font-size', size); el.textContent = txt;
        }
        if(!el) return;
        el.setAttribute('fill', fill);
        el.setAttribute('stroke', stroke);
        el.setAttribute('stroke-width', sw);
        if(dash) el.setAttribute('stroke-dasharray', dash);
        el.setAttribute('opacity', opacity);
        ensureIdGlobal(el, tool);
        svg.appendChild(el);
        // select and refresh layers
        try{ window.refreshLayers(); window.selectElementById(el.id); if(typeof window.showRightTab === 'function') window.showRightTab('inspector'); }catch(e){}
        const f = document.getElementById('primitive-form'); if(f) f.style.display = 'none';
        if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){}
    }


    window.refreshLayers = function(){
        const list = document.getElementById('layersList'); if(!list) return;
        list.innerHTML = '';
        const svg = document.getElementById('svgCanvas'); if(!svg) return;

        function ensureId(el){
            if(!el.id){ el.id = 'el_' + Math.random().toString(36).substr(2,9); }
            return el.id;
        }

        function buildTree(containerEl, parentNode, depth){
            const children = Array.from(parentNode.children);
            children.forEach(function(ch){
                if(!ch.tagName) return;
                if(ch.tagName.toLowerCase() === 'defs') return;

                const row = document.createElement('div'); row.className = 'layer-item';
                if(ch.dataset && ch.dataset.locked==='1') row.classList.add('locked');
                if(window.selectedElement===ch) row.classList.add('selected');

                const left = document.createElement('div'); left.className = 'left';
                const indent = document.createElement('span'); indent.className='indent'; indent.style.marginLeft = (depth*8)+'px';
                left.appendChild(indent);

                // multi-select checkbox
                const cb = document.createElement('input'); cb.type='checkbox'; cb.className='layer-select-checkbox';
                const elId = ensureId(ch);
                cb.dataset.elId = elId;
                // when checkbox toggles, reflect selection and highlight in SVG
                cb.addEventListener('change', function(e){
                    try{
                        if(cb.checked){
                            ch.classList.add('editor-selected');
                            // mark row selected visually
                            // find corresponding row and add class
                            // (we're in the row context so caller will handle)
                            window.selectedElement = ch;
                        } else {
                            ch.classList.remove('editor-selected');
                            if(window.selectedElement === ch) window.selectedElement = null;
                        }
                        if(typeof updateToolbarButtonsState === 'function') updateToolbarButtonsState();
                    }catch(err){/* ignore */}
                });
                left.appendChild(cb);

                const icon = document.createElement('span'); icon.className='tag'; icon.style.opacity=0.7; icon.textContent = ch.tagName.toLowerCase();
                left.appendChild(icon);

                const name = document.createElement('div'); name.className='name';
                const displayName = ch.getAttribute('inkscape:label') || ch.id || ch.tagName.toLowerCase();
                name.textContent = displayName;
                left.appendChild(name);

                const controls = document.createElement('div'); controls.className='controls';
                const eye = document.createElement('button'); eye.className='layer-toggle'; eye.title='Toggle visibility';
                eye.innerHTML = (ch.style && ch.style.display==='none')? '🙈':'👁';
                eye.addEventListener('click', function(e){ e.stopPropagation(); if(ch.style) ch.style.display = (ch.style.display==='none')? '': 'none'; window.refreshLayers(); });
                const lock = document.createElement('button'); lock.className='layer-toggle'; lock.title='Lock/Unlock';
                lock.innerHTML = (ch.dataset && ch.dataset.locked==='1')? '🔒':'🔓';
                lock.addEventListener('click', function(e){ e.stopPropagation(); ch.dataset.locked = (ch.dataset.locked==='1')? '0':'1'; window.refreshLayers(); });
                controls.appendChild(eye); controls.appendChild(lock);

                row.appendChild(left); row.appendChild(controls);

                row.addEventListener('click', function(e){
                    e.stopPropagation();
                    // Ctrl/Cmd or Shift to multi-select (toggle)
                    if(e.ctrlKey || e.metaKey || e.shiftKey){
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change'));
                        // toggle row visual selected class
                        if(cb.checked) row.classList.add('selected'); else row.classList.remove('selected');
                    } else {
                        selectLayerNode(ch, row);
                    }
                });

                containerEl.appendChild(row);

                if(ch.children && ch.children.length>0){
                    const childWrap = document.createElement('div'); childWrap.className='layer-children';
                    containerEl.appendChild(childWrap);
                    buildTree(childWrap, ch, depth+1);
                }
            });
        }

        buildTree(list, svg, 0);
        commitHistory();
    };

    // Inspector: update UI when selection changes
    window.updateInspectorFor = function(elem){
        const empty = document.getElementById('inspector-empty');
        const fields = document.getElementById('inspector-fields');
        if(!elem){ if(empty) empty.style.display='block'; if(fields) fields.style.display='none'; removeTransformControls(); return; }
        if(empty) empty.style.display='none'; if(fields) fields.style.display='block';
        // fill basic properties
        const fill = elem.getAttribute('fill') || '#000000';
        const stroke = elem.getAttribute('stroke') || '#000000';
        const sw = elem.getAttribute('stroke-width') || 1;
        const dash = elem.getAttribute('stroke-dasharray') || '';
        const op = elem.getAttribute('opacity') || 1;
        document.getElementById('ins_fill').value = cssColorToHex(fill);
        document.getElementById('ins_stroke').value = cssColorToHex(stroke);
        document.getElementById('ins_stroke_width').value = sw;
        document.getElementById('ins_dash').value = dash;
        document.getElementById('ins_opacity').value = op;
        // transform parsing
        const t = parseTransform(elem.getAttribute('transform'));
        document.getElementById('ins_tx').value = t.translate.x;
        document.getElementById('ins_ty').value = t.translate.y;
        document.getElementById('ins_sx').value = t.scale.x;
        document.getElementById('ins_sy').value = t.scale.y;
        document.getElementById('ins_rot').value = t.rotate.angle;
        document.getElementById('ins_skx').value = t.skew.x;
        document.getElementById('ins_sky').value = t.skew.y;
        document.getElementById('ins_lock_aspect').checked = true;

        // wire apply/reset/flip
        document.getElementById('ins_apply').onclick = function(){ applyInspectorTo(elem); };
        document.getElementById('ins_reset').onclick = function(){ elem.removeAttribute('transform'); window.updateInspectorFor(elem); };
        document.getElementById('ins_flip_h').onclick = function(){ const cur = parseTransform(elem.getAttribute('transform')); cur.scale.x = -cur.scale.x; setTransformAroundCenter(elem, cur); window.updateInspectorFor(elem); };
        document.getElementById('ins_flip_v').onclick = function(){ const cur = parseTransform(elem.getAttribute('transform')); cur.scale.y = -cur.scale.y; setTransformAroundCenter(elem, cur); window.updateInspectorFor(elem); };

        // show/hide text input row when selecting a text element
        try{
            const textRow = document.getElementById('inspector-text-row');
            const insText = document.getElementById('ins_text');
            if(textRow){
                if(elem && elem.tagName && elem.tagName.toLowerCase() === 'text'){
                    textRow.style.display = 'block';
                    if(insText) insText.value = elem.textContent || '';
                    // populate fonts and sizes
                    populateFontControls(elem);
                    populatePathSelect(elem);
                } else {
                    textRow.style.display = 'none';
                    if(insText) insText.value = '';
                }
            }
        }catch(e){}
        // no transform overlay (resize disabled) - inspector controls will be used
    };

    // Populate font controls for text element
    function populateFontControls(elem){
        try{
            const fonts = ['Arial','Helvetica','Times New Roman','Georgia','Verdana','Courier New','Roboto','Open Sans'];
            const sel = document.getElementById('ins_font');
            const sizeEl = document.getElementById('ins_font_size');
            if(!sel || !sizeEl) return;
            // fill options if empty
            if(sel.options.length === 0){
                fonts.forEach(f=>{ const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o); });
            }
            // set current values from element
            const styleFont = (elem.getAttribute('font-family') || elem.style.fontFamily || '').replace(/"/g,'').split(',')[0].trim();
            if(styleFont) try{ sel.value = styleFont; }catch(e){}
            const fsize = elem.getAttribute('font-size') || window.getComputedStyle(elem).fontSize || '24px';
            sizeEl.value = parseInt(fsize,10) || 24;

            // handlers
            sel.onchange = function(){ try{ elem.setAttribute('font-family', sel.value); if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){} }catch(e){} };
            sizeEl.onchange = function(){ try{ elem.setAttribute('font-size', sizeEl.value); if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){} }catch(e){} };
        }catch(e){console.warn(e);}    
    }

    // Populate path select with available path-ish elements
    function populatePathSelect(textElem){
        try{
            const sel = document.getElementById('ins_path_select'); if(!sel) return;
            sel.innerHTML = '';
            const svg = document.getElementById('svgCanvas'); if(!svg) return;
            const candidates = Array.from(svg.querySelectorAll('path, polyline, polygon, circle, ellipse'));
            candidates.forEach((el,i)=>{
                const id = ensureIdGlobal(el, 'path');
                const opt = document.createElement('option'); opt.value = id; opt.textContent = (el.id || el.tagName.toLowerCase() + '_' + (i+1)); sel.appendChild(opt);
            });
            // attach handlers
            const attach = document.getElementById('ins_attach_path'); const detach = document.getElementById('ins_detach_path');
            if(attach) attach.onclick = function(){ const pid = sel.value; if(!pid) return alert('Выберите путь'); attachTextToPath(textElem, pid); };
            if(detach) detach.onclick = function(){ detachTextFromPath(textElem); };
            const makeCircle = document.getElementById('ins_make_circle_text'); if(makeCircle) makeCircle.onclick = function(){ const r = parseFloat(document.getElementById('ins_circle_radius').value)||80; makeCircularText(textElem, r); };
            const toPath = document.getElementById('ins_to_path'); if(toPath) toPath.onclick = function(){ convertTextToPath(textElem); };
        }catch(e){ console.warn(e); }
    }

    function attachTextToPath(textElem, pathId){
        try{
            const svg = document.getElementById('svgCanvas'); if(!svg) return;
            const pathEl = svg.querySelector('#'+CSS.escape(pathId)); if(!pathEl) return alert('Путь не найден');
            // if pathEl is not a <path>, convert its geometry to a path and place in defs
            let pathNode = pathEl;
            if(pathEl.tagName.toLowerCase() !== 'path'){
                // create path from polyline/polygon/circle/ellipse
                const d = shapeToPathD(pathEl);
                if(!d) return alert('Невозможно конвертировать выбранную форму в путь');
                const defs = getOrCreateDefs(svg);
                const newId = pathId + '_aspath';
                let existing = svg.querySelector('#'+CSS.escape(newId));
                if(!existing){ existing = document.createElementNS('http://www.w3.org/2000/svg','path'); existing.setAttribute('d', d); existing.id = newId; defs.appendChild(existing); }
                pathNode = existing;
            }
            // create textPath inside text element
            // remove existing textPath children
            let textContent = textElem.textContent || '';
            // clear content
            textElem.textContent = '';
            const tp = document.createElementNS('http://www.w3.org/2000/svg','textPath');
            tp.setAttributeNS('http://www.w3.org/1999/xlink','href', '#'+pathNode.id);
            tp.setAttribute('startOffset','0%');
            tp.textContent = textContent;
            textElem.appendChild(tp);
            if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){}
            window.refreshLayers(); window.updateInspectorFor(textElem);
        }catch(e){ console.error(e); alert('Ошибка привязки текста к пути: ' + e.message); }
    }

    function detachTextFromPath(textElem){
        try{
            if(!textElem) return;
            const tp = textElem.querySelector('textPath');
            if(!tp) return alert('Текст не привязан к пути');
            const txt = tp.textContent || '';
            // remove textPath and set plain text
            tp.remove();
            textElem.textContent = txt;
            if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){}
            window.refreshLayers(); window.updateInspectorFor(textElem);
        }catch(e){ console.error(e); }
    }

    function makeCircularText(textElem, radius){
        try{
            const svg = document.getElementById('svgCanvas'); if(!svg) return;
            // compute center near the text bbox
            const bbox = textElem.getBBox();
            const cx = bbox.x + bbox.width/2; const cy = bbox.y + bbox.height/2;
            const d = 'M ' + (cx+radius) + ' ' + cy + ' A ' + radius + ' ' + radius + ' 0 1 1 ' + (cx-radius) + ' ' + cy + ' A ' + radius + ' ' + radius + ' 0 1 1 ' + (cx+radius) + ' ' + cy;
            const defs = getOrCreateDefs(svg);
            const id = 'circle_text_path_' + Math.random().toString(36).substr(2,8);
            const p = document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d', d); p.id = id; defs.appendChild(p);
            attachTextToPath(textElem, id);
        }catch(e){ console.error(e); alert('Ошибка создания кругового текста: ' + e.message); }
    }

    function convertTextToPath(textElem){
        // Converting text glyphs to precise SVG paths requires font outlines (not available in all browsers).
        // Best-effort: If browser supports SVG2 text-to-path APIs or opentype.js is available we could implement it.
        // For now, inform the user and fallback to exporting SVG for external conversion.
        alert('Преобразование текста в контуры не реализовано в этой версии. Вы можете экспортировать SVG и использовать внешние инструменты (Inkscape, Illustrator) для преобразования.');
    }

    function getOrCreateDefs(svg){ let defs = svg.querySelector('defs'); if(!defs){ defs = document.createElementNS('http://www.w3.org/2000/svg','defs'); svg.insertBefore(defs, svg.firstChild); } return defs; }

    function shapeToPathD(el){
        try{
            const tag = el.tagName.toLowerCase();
            if(tag === 'path') return el.getAttribute('d');
            if(tag === 'polyline' || tag === 'polygon'){
                const pts = el.getAttribute('points') || '';
                const coords = pts.trim().split(/\s+/).map(s=>s.trim()).filter(Boolean);
                if(coords.length===0) return '';
                let d = 'M ' + coords[0];
                for(let i=1;i<coords.length;i++) d += ' L ' + coords[i];
                if(tag === 'polygon') d += ' Z';
                return d;
            }
            if(tag === 'circle'){
                const cx = parseFloat(el.getAttribute('cx')||0); const cy = parseFloat(el.getAttribute('cy')||0); const r = parseFloat(el.getAttribute('r')||0);
                return 'M ' + (cx+r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 1 0 ' + (cx-r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 1 0 ' + (cx+r) + ' ' + cy;
            }
            if(tag === 'ellipse'){
                const cx = parseFloat(el.getAttribute('cx')||0); const cy = parseFloat(el.getAttribute('cy')||0); const rx = parseFloat(el.getAttribute('rx')||0); const ry = parseFloat(el.getAttribute('ry')||0);
                return 'M ' + (cx+rx) + ' ' + cy + ' A ' + rx + ' ' + ry + ' 0 1 0 ' + (cx-rx) + ' ' + cy + ' A ' + rx + ' ' + ry + ' 0 1 0 ' + (cx+rx) + ' ' + cy;
            }
        }catch(e){ console.warn(e); }
        return '';
    }

    // Utility: convert simple css color to hex if possible
    function cssColorToHex(v){ try{ if(!v) return '#000000'; if(v.startsWith('#')) return v; // basic
            // create temporary element to compute
            const span = document.createElement('span'); span.style.color = v; document.body.appendChild(span);
            const cs = getComputedStyle(span).color; document.body.removeChild(span);
            const m = cs.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if(m) return '#'+[1,2,3].map(i=>parseInt(m[i]).toString(16).padStart(2,'0')).join('');
        }catch(e){}
        return '#000000'; }

    // Parse transform attribute into components
    function parseTransform(str){ const res = { translate:{x:0,y:0}, scale:{x:1,y:1}, rotate:{angle:0,cx:0,cy:0}, skew:{x:0,y:0} };
        if(!str) return res;
        try{
            const t = str;
            const reTranslate = /translate\s*\(([^)]+)\)/;
            const reScale = /scale\s*\(([^)]+)\)/;
            const reRotate = /rotate\s*\(([^)]+)\)/;
            const reSkX = /skewX\s*\(([^)]+)\)/;
            const reSkY = /skewY\s*\(([^)]+)\)/;
            const mT = t.match(reTranslate); if(mT){ const parts = mT[1].split(/[ ,]+/).map(Number); res.translate.x = parts[0]||0; res.translate.y = parts[1]||0; }
            const mS = t.match(reScale); if(mS){ const parts = mS[1].split(/[ ,]+/).map(Number); res.scale.x = parts[0]||1; res.scale.y = (parts[1]!==undefined)?parts[1]:parts[0]; }
            const mR = t.match(reRotate); if(mR){ const parts = mR[1].split(/[ ,]+/).map(Number); res.rotate.angle = parts[0]||0; if(parts[1]!==undefined){ res.rotate.cx = parts[1]; res.rotate.cy = parts[2]||0; }}
            const mKX = t.match(reSkX); if(mKX){ res.skew.x = parseFloat(mKX[1])||0; }
            const mKY = t.match(reSkY); if(mKY){ res.skew.y = parseFloat(mKY[1])||0; }
        }catch(e){}
        return res;
    }

    function setTransformFromState(elem, st){ const parts = [];
        if(st.translate) parts.push('translate(' + (st.translate.x||0) + ',' + (st.translate.y||0) + ')');
        if(st.rotate) parts.push('rotate(' + (st.rotate.angle||0) + (st.rotate.cx?(' '+st.rotate.cx+' '+st.rotate.cy):'') + ')');
        if(st.skew){ if(st.skew.x) parts.push('skewX(' + st.skew.x + ')'); if(st.skew.y) parts.push('skewY(' + st.skew.y + ')'); }
        if(st.scale) parts.push('scale(' + (st.scale.x||1) + ',' + (st.scale.y||1) + ')');
        elem.setAttribute('transform', parts.join(' '));
    }

    // Set transform applying scale around the element center to avoid moving out of view when scale negative
    function setTransformAroundCenter(elem, st){
        try{
            const bbox = elem.getBBox();
            const cx = bbox.x + bbox.width/2;
            const cy = bbox.y + bbox.height/2;
            const parts = [];
            if(st.translate) parts.push('translate(' + (st.translate.x||0) + ',' + (st.translate.y||0) + ')');
            if(st.rotate) parts.push('rotate(' + (st.rotate.angle||0) + (st.rotate.cx?(' '+st.rotate.cx+' '+st.rotate.cy):'') + ')');
            if(st.skew){ if(st.skew.x) parts.push('skewX(' + st.skew.x + ')'); if(st.skew.y) parts.push('skewY(' + st.skew.y + ')'); }
            // translate to center, scale, translate back
            parts.push('translate(' + cx + ',' + cy + ')');
            if(st.scale) parts.push('scale(' + (st.scale.x||1) + ',' + (st.scale.y||1) + ')');
            parts.push('translate(' + (-cx) + ',' + (-cy) + ')');
            elem.setAttribute('transform', parts.join(' '));
        }catch(e){ setTransformFromState(elem, st); }
    }

    function applyInspectorTo(elem){
        try{
            const fill = document.getElementById('ins_fill').value; const stroke = document.getElementById('ins_stroke').value;
            const sw = document.getElementById('ins_stroke_width').value; const dash = document.getElementById('ins_dash').value; const op = document.getElementById('ins_opacity').value;
            elem.setAttribute('fill', fill);
            elem.setAttribute('stroke', stroke);
            elem.setAttribute('stroke-width', sw);
            if(dash) elem.setAttribute('stroke-dasharray', dash); else elem.removeAttribute('stroke-dasharray');
            if(op!==null) elem.setAttribute('opacity', op);
            // If element is text and inspector has text field, update content
            const insTextEl = document.getElementById('ins_text');
            if(insTextEl && elem.tagName && elem.tagName.toLowerCase() === 'text'){
                elem.textContent = insTextEl.value;
            }
            // transforms
            const st = parseTransform(elem.getAttribute('transform'));
            st.translate.x = parseFloat(document.getElementById('ins_tx').value)||0;
            st.translate.y = parseFloat(document.getElementById('ins_ty').value)||0;
            const sx = parseFloat(document.getElementById('ins_sx').value)||1; const sy = parseFloat(document.getElementById('ins_sy').value)||1;
            const lock = document.getElementById('ins_lock_aspect').checked;
            if(lock) st.scale.y = sx; st.scale.x = sx; if(!lock) st.scale.y = sy;
            st.rotate.angle = parseFloat(document.getElementById('ins_rot').value)||0;
            st.skew.x = parseFloat(document.getElementById('ins_skx').value)||0;
            st.skew.y = parseFloat(document.getElementById('ins_sky').value)||0;
            setTransformFromState(elem, st);
            commitHistory();
            // update overlay
            createTransformControls(elem);
            if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){}
        }catch(e){ console.error(e); }
    }

    // Transform overlay controls implementation (basic scaling corners and rotate handle)
    let _transformOverlay = null;
    // Transform overlay disabled: no visual handles for resizing on-canvas.
    function createTransformControls(elem){
        // intentionally left blank to disable on-canvas resize handles
        return;
    }

    function removeTransformControls(){ if(_transformOverlay && _transformOverlay.group){ try{ _transformOverlay.group.remove(); }catch(e){} } _transformOverlay = null; }

    function handleCursorForPos(pos){ return handleCursor(pos); }

    function handleCursor(pos){ const map = {nw:'nwse-resize',n:'ns-resize',ne:'nesw-resize',e:'ew-resize',se:'nwse-resize',s:'ns-resize',sw:'nesw-resize',w:'ew-resize'}; return map[pos]||'move'; }

    function handleCoords(bbox,pos){ const x = bbox.x, y = bbox.y, w=bbox.width, h=bbox.height; const centers = { nw:{x:x,y:y}, n:{x:x+w/2,y:y}, ne:{x:x+w,y:y}, e:{x:x+w,y:y+h/2}, se:{x:x+w,y:y+h}, s:{x:x+w/2,y:y+h}, sw:{x:x,y:y+h}, w:{x:x,y:y+h/2} }; return centers[pos]||{x:x,y:y}; }

    // Drag handlers for overlay
    let _handleState = null;
    function startHandleDrag(evt){ evt.stopPropagation(); evt.preventDefault(); const pos = evt.target.dataset.pos; const svg = document.getElementById('svgCanvas'); if(!svg) return; const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY; const inv = svg.getScreenCTM().inverse(); const loc = pt.matrixTransform(inv);
        _handleState = { pos: pos, start:{x:loc.x,y:loc.y}, target: _transformOverlay ? _transformOverlay.target : null, origBBox: null, origTransform: parseTransform((_transformOverlay && _transformOverlay.target)?_transformOverlay.target.getAttribute('transform'):'') };
        if(_handleState.target) _handleState.origBBox = _handleState.target.getBBox();
        window.addEventListener('mousemove', handleDragging);
        window.addEventListener('mouseup', endHandleDrag);
    }

    function handleDragging(evt){ if(!_handleState || !_handleState.target) return; const svg = document.getElementById('svgCanvas'); const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY; const inv = svg.getScreenCTM().inverse(); const loc = pt.matrixTransform(inv);
        const dx = loc.x - _handleState.start.x; const dy = loc.y - _handleState.start.y;
        const pos = _handleState.pos; const el = _handleState.target; const bbox = _handleState.origBBox;
        if(pos === 'rot'){
            // rotate around center
            const cx = bbox.x + bbox.width/2; const cy = bbox.y + bbox.height/2;
            const ang = Math.atan2(loc.y - cy, loc.x - cx) * 180/Math.PI;
            const st = _handleState.origTransform; st.rotate.angle = ang; st.rotate.cx = cx; st.rotate.cy = cy; setTransformFromState(el, st);
        } else {
            // simple scaling from center for corner handles
            const orig = bbox; let sx=1, sy=1;
            if(pos==='nw' || pos==='ne' || pos==='sw' || pos==='se'){
                const cx = orig.x + orig.width/2; const cy = orig.y + orig.height/2;
                const mx = (loc.x - cx) / ( (_handleState.start.x - cx) || 1 );
                const my = (loc.y - cy) / ( (_handleState.start.y - cy) || 1 );
                sx = mx; sy = my;
            } else if(pos==='n' || pos==='s'){
                sy = (orig.height/2 + (loc.y - _handleState.start.y)) / (orig.height/2 || 1);
            } else if(pos==='e' || pos==='w'){
                sx = (orig.width/2 + (loc.x - _handleState.start.x)) / (orig.width/2 || 1);
            }
            const st = _handleState.origTransform; st.scale.x = (st.scale.x||1) * sx; st.scale.y = (st.scale.y||1) * sy; setTransformFromState(el, st);
        }
        // update overlay position
        createTransformControls(_handleState.target);
    }

    function endHandleDrag(evt){ window.removeEventListener('mousemove', handleDragging); window.removeEventListener('mouseup', endHandleDrag); if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){} _handleState = null; }

    function selectLayerNode(elem, row){
        // Toggle selection: if clicking already-selected element, clear selection
        if(window.selectedElement === elem){
            // clear selection
            window.selectedElement = null;
            document.querySelectorAll('#layersList .layer-item').forEach(n=>n.classList.remove('selected'));
            // uncheck corresponding checkbox
            if(elem && elem.id){
                const cb = document.querySelector('#layersList input.layer-select-checkbox[data-el-id="'+elem.id+'"]');
                if(cb) cb.checked = false;
            }
            try{ document.querySelectorAll('#svgCanvas .editor-selected').forEach(n=>n.classList.remove('editor-selected')); }catch(e){}
            if(typeof window.updateInspectorFor === 'function') window.updateInspectorFor(null);
            if(typeof window.showRightTab === 'function') window.showRightTab('layers');
            if(typeof updateToolbarButtonsState === 'function') updateToolbarButtonsState();
            return;
        }

        // clear previous single-selection visuals
        document.querySelectorAll('#layersList .layer-item').forEach(n=>n.classList.remove('selected'));
        if(row) row.classList.add('selected');
        // set selected element
        window.selectedElement = elem;

        // ensure corresponding checkbox is checked and others cleared
        document.querySelectorAll('#layersList .layer-select-checkbox').forEach(cb=>cb.checked=false);
        if(elem && elem.id){
            const cb = document.querySelector('#layersList input.layer-select-checkbox[data-el-id="'+elem.id+'"]');
            if(cb) cb.checked = true;
        }

        // visual highlight in SVG
        try{
            document.querySelectorAll('#svgCanvas .editor-selected').forEach(n=>n.classList.remove('editor-selected'));
            if(elem instanceof Element) elem.classList.add('editor-selected');
        }catch(e){/* ignore */}

        if(typeof window.updateInspectorFor === 'function') window.updateInspectorFor(elem);
        if(typeof updateToolbarButtonsState === 'function') updateToolbarButtonsState();
    }

    // Expose select by id or element
    window.selectElementById = function(id){
        const svg = document.getElementById('svgCanvas'); if(!svg) return;
        const el = svg.querySelector('#'+CSS.escape(id)); if(el) selectLayerNode(el, null);
    };


    // Utilities for layer actions
    function getSelectedElements(){
        const list = document.getElementById('layersList'); if(!list) return [];
        const checks = Array.from(list.querySelectorAll('input.layer-select-checkbox:checked'));
        const svg = document.getElementById('svgCanvas'); if(!svg) return [];
        const els = checks.map(cb=> svg.querySelector('#'+CSS.escape(cb.dataset.elId))).filter(Boolean);
        if(els.length===0 && window.selectedElement) return [window.selectedElement];
        return els;
    }

    window.createLayer = function(name){
        const svg = document.getElementById('svgCanvas'); if(!svg) return;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.id = name ? name.replace(/\s+/g,'_') : 'layer_' + Math.random().toString(36).substr(2,6);
        g.setAttribute('inkscape:label', name||g.id);
        svg.appendChild(g);
        window.refreshLayers();
        window.selectElementById(g.id);
    };

    window.renameLayer = function(){
        const sels = getSelectedElements(); if(sels.length!==1){ alert('Выберите один слой для переименования'); return; }
        const el = sels[0]; const newName = prompt('Новое имя слоя', el.id||'layer'); if(!newName) return;
        el.id = newName.replace(/\s+/g,'_'); el.setAttribute('inkscape:label', newName);
        window.refreshLayers();
    };

    window.deleteSelected = function(){
        const els = getSelectedElements(); if(els.length===0) return; if(!confirm('Удалить выбранные элементы?')) return;
        els.forEach(e=>{ if(e.parentNode) e.parentNode.removeChild(e); });
        // clear single selection if it was among deleted
        commitHistory();
        window.selectedElement = null;
        window.refreshLayers();
        if(typeof updateToolbarButtonsState === 'function') updateToolbarButtonsState();
    };

    function insertAfter(parent, node, reference){
        parent.insertBefore(node, reference && reference.nextSibling);
    }

    window.moveLayer = function(direction){
        const els = getSelectedElements(); if(els.length===0) return;
        els.forEach(e=>{
            const p = e.parentNode; if(!p) return;
            if(direction === 'up'){
                const next = e.nextSibling; if(next) insertAfter(p, e, next);
            } else if(direction === 'down'){
                const prev = e.previousSibling; if(prev) p.insertBefore(e, prev);
            } else if(direction === 'top'){
                p.appendChild(e);
            } else if(direction === 'bottom'){
                p.insertBefore(e, p.firstChild);
            }
        });
        window.refreshLayers();
    }

    window.groupSelection = function(){
        const sels = getSelectedElements(); if(sels.length<2){ alert('Выберите 2+ элементов для группировки'); return; }
        const svg = document.getElementById('svgCanvas'); if(!svg) return;
        const g = document.createElementNS('http://www.w3.org/2000/svg','g'); g.id = 'group_' + Math.random().toString(36).substr(2,6);
        sels[0].parentNode.appendChild(g);
        sels.forEach(el=> g.appendChild(el));
        commitHistory();
        window.refreshLayers(); window.selectElementById(g.id);
    };

    window.ungroupSelection = function(){
        const sels = getSelectedElements(); if(sels.length!==1){ alert('Выберите группу для разгруппировки'); return; }
        const g = sels[0]; if(!g || g.tagName.toLowerCase()!=='g') { alert('Выбранный элемент не группа'); return; }
        const parent = g.parentNode; while(g.firstChild) parent.insertBefore(g.firstChild, g);
        parent.removeChild(g);
        window.refreshLayers();
        commitHistory();
    };

    window.alignSelected = function(mode){
        const els = getSelectedElements(); if(els.length<2) { alert('Выберите 2+ элементов для выравнивания'); return; }
        const boxes = els.map(e=>{ try{ return e.getBBox(); }catch(e){ return null; } }).filter(Boolean);
        if(boxes.length===0) return;
        const minX = Math.min(...boxes.map(b=>b.x));
        const maxX = Math.max(...boxes.map(b=>b.x + b.width));
        const minY = Math.min(...boxes.map(b=>b.y));
        const maxY = Math.max(...boxes.map(b=>b.y + b.height));
        const centerX = (minX + maxX)/2; const centerY = (minY + maxY)/2;

        els.forEach((el, idx)=>{
            const b = boxes[idx]; if(!b) return;
            let dx=0, dy=0;
            if(mode==='left') dx = minX - b.x;
            else if(mode==='center') dx = centerX - (b.x + b.width/2);
            else if(mode==='right') dx = maxX - (b.x + b.width);
            else if(mode==='top') dy = minY - b.y;
            else if(mode==='middle') dy = centerY - (b.y + b.height/2);
            else if(mode==='bottom') dy = maxY - (b.y + b.height);

            // apply translation via transform state (avoid appending after scale which inverts direction)
            try{
                const st = parseTransform(el.getAttribute('transform'));
                st.translate.x = (st.translate.x || 0) + dx;
                st.translate.y = (st.translate.y || 0) + dy;
                setTransformFromState(el, st);
            }catch(e){ const prev = el.getAttribute('transform') || ''; const t = ' translate(' + dx + ',' + dy + ')'; el.setAttribute('transform', prev + t); }
        });
        commitHistory();
        window.refreshLayers();
    };

    window.distributeSelected = function(dir){
        const els = getSelectedElements(); if(els.length<3){ alert('Нужно минимум 3 элемента для распределения'); return; }
        const boxes = els.map(e=>{ try{ return e.getBBox(); }catch(e){ return null; } }).filter(Boolean);
        if(boxes.length===0) return;
        // sort by center position
        const paired = els.map((el,i)=>({el,box:boxes[i],centerX:boxes[i].x+boxes[i].width/2, centerY:boxes[i].y+boxes[i].height/2}));
        if(dir==='h') paired.sort((a,b)=>a.centerX-b.centerX);
        else paired.sort((a,b)=>a.centerY-b.centerY);
        const first = paired[0].box; const last = paired[paired.length-1].box;
        const span = (dir==='h') ? (last.x+last.width/2 - (first.x+first.width/2)) : (last.y+last.height/2 - (first.y+first.height/2));
        const step = span / (paired.length-1);
        paired.forEach((p, idx)=>{
            const targetCenter = (dir==='h') ? (first.x+first.width/2 + step*idx) : (first.y+first.height/2 + step*idx);
            const curCenter = (dir==='h') ? p.centerX : p.centerY;
            const delta = targetCenter - curCenter;
            try{
                const st = parseTransform(p.el.getAttribute('transform'));
                if(dir==='h') st.translate.x = (st.translate.x || 0) + delta; else st.translate.y = (st.translate.y || 0) + delta;
                setTransformFromState(p.el, st);
            }catch(e){ const prev = p.el.getAttribute('transform') || ''; const t = (dir==='h') ? (' translate(' + delta + ',0)') : (' translate(0,' + delta + ')'); p.el.setAttribute('transform', prev + t); }
        });
        window.refreshLayers();
    };

// --- Undo/Redo System ---
window.historyStack = [];
window.historyIndex = -1;
window.maxHistory = 50;
window.isRestoringState = false; // Флаг для предотвращения рекурсии

// Save current state to history
window.pushHistory = function(force = false) {
    try {
        // Если в процессе восстановления состояния, не добавляем в историю
        if (window.isRestoringState && !force) return;
        
        const svg = document.getElementById('svgCanvas');
        if (!svg) return;
        
        // Serialize current state
        const state = {
            svg: svg.innerHTML,
            width: svg.getAttribute('width'),
            height: svg.getAttribute('height'),
            viewBox: svg.getAttribute('viewBox'),
            timestamp: Date.now()
        };
        
        // Если состояние идентично последнему, не добавляем (кроме принудительно)
        if (!force && window.historyStack.length > 0) {
            const lastState = window.historyStack[window.historyStack.length - 1];
            if (JSON.stringify(state.svg) === JSON.stringify(lastState.svg) &&
                state.width === lastState.width &&
                state.height === lastState.height &&
                state.viewBox === lastState.viewBox) {
                return;
            }
        }
        
        // Если мы в середине истории (после undo), удаляем будущие состояния
        if (window.historyIndex < window.historyStack.length - 1) {
            window.historyStack = window.historyStack.slice(0, window.historyIndex + 1);
        }
        
        // Добавляем новое состояние
        window.historyStack.push(state);
        
        // Ограничиваем размер истории
        if (window.historyStack.length > window.maxHistory) {
            window.historyStack.shift();
            // Корректируем индекс если удалили элементы из начала
            if (window.historyIndex > 0) {
                window.historyIndex--;
            }
        }
        
        window.historyIndex = window.historyStack.length - 1;
        
        console.log(`History pushed. Index: ${window.historyIndex}, Total: ${window.historyStack.length}`);
        
        // Обновляем состояние кнопок
        updateUndoRedoButtons();
        
    } catch (error) {
        console.error('Error pushing history:', error);
    }
};

// Undo function
window.undo = function() {
    console.log(`Undo called. Current index: ${window.historyIndex}`);
    
    if (window.historyIndex > 0) {
        window.historyIndex--;
        console.log(`Undo to index: ${window.historyIndex}`);
        restoreState(window.historyIndex);
        return true;
    }
    console.log('Undo not available');
    return false;
};

// Redo function
window.redo = function() {
    console.log(`Redo called. Current index: ${window.historyIndex}, Total: ${window.historyStack.length}`);
    
    if (window.historyIndex < window.historyStack.length - 1) {
        window.historyIndex++;
        console.log(`Redo to index: ${window.historyIndex}`);
        restoreState(window.historyIndex);
        return true;
    }
    console.log('Redo not available');
    return false;
};

// Restore state from history
function restoreState(index) {
    try {
        window.isRestoringState = true;
        
        const state = window.historyStack[index];
        if (!state) {
            console.error('No state at index:', index);
            window.isRestoringState = false;
            return;
        }
        
        console.log(`Restoring state ${index}`);
        
        const svg = document.getElementById('svgCanvas');
        if (!svg) {
            window.isRestoringState = false;
            return;
        }
        
        // Save selection before restoring
        const selectedId = window.selectedElement ? window.selectedElement.id : null;
        
        // Restore SVG content and attributes
        svg.innerHTML = state.svg;
        
        if (state.width) svg.setAttribute('width', state.width);
        else svg.removeAttribute('width');
        
        if (state.height) svg.setAttribute('height', state.height);
        else svg.removeAttribute('height');
        
        if (state.viewBox) svg.setAttribute('viewBox', state.viewBox);
        else svg.removeAttribute('viewBox');
        
        // Try to restore selection
        if (selectedId) {
            const selectedEl = svg.querySelector('#' + CSS.escape(selectedId));
            if (selectedEl) {
                window.selectedElement = selectedEl;
                selectedEl.classList.add('editor-selected');
            } else {
                window.selectedElement = null;
            }
        } else {
            window.selectedElement = null;
        }
        
        // Refresh UI
        if (typeof window.refreshLayers === 'function') {
            setTimeout(() => {
                window.refreshLayers();
                if (typeof window.updateInspectorFor === 'function') {
                    window.updateInspectorFor(window.selectedElement);
                }
                updateUndoRedoButtons();
            }, 10);
        } else {
            updateUndoRedoButtons();
        }
        
    } catch (error) {
        console.error('Error restoring state:', error);
    } finally {
        setTimeout(() => {
            window.isRestoringState = false;
        }, 50);
    }
}

// Update undo/redo button states
function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    console.log(`Updating buttons. Index: ${window.historyIndex}, Total: ${window.historyStack.length}, Can undo: ${window.historyIndex > 0}, Can redo: ${window.historyIndex < window.historyStack.length - 1}`);
    
    if (undoBtn) {
        undoBtn.disabled = window.historyIndex <= 0;
        undoBtn.title = `Отменить (Ctrl+Z) - ${window.historyIndex > 0 ? 'Доступно' : 'Недоступно'}`;
        
        // Убираем класс active если был
        undoBtn.classList.remove('active');
    }
    
    if (redoBtn) {
        redoBtn.disabled = window.historyIndex >= window.historyStack.length - 1;
        redoBtn.title = `Повторить (Ctrl+Y) - ${window.historyIndex < window.historyStack.length - 1 ? 'Доступно' : 'Недоступно'}`;
        
        // Убираем класс active если был
        redoBtn.classList.remove('active');
    }
}

// Initialize history with initial state
function initializeHistory() {
    // Ждем полной загрузки DOM
    setTimeout(() => {
        window.pushHistory(true); // Принудительно добавляем начальное состояние
        console.log('History initialized');
        updateUndoRedoButtons();
    }, 500);
}

// Keyboard shortcut handler for undo/redo
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Игнорируем если в поле ввода
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Ctrl+Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (window.undo()) {
                console.log('Undo performed via keyboard');
            }
        }
        // Ctrl+Y for redo
        else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            e.stopPropagation();
            if (window.redo()) {
                console.log('Redo performed via keyboard');
            }
        }
        // Ctrl+Shift+Z for redo (alternative)
        else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (window.redo()) {
                console.log('Redo performed via keyboard (Ctrl+Shift+Z)');
            }
        }
    }, true); // Используем capture phase
}

// Wire up existing buttons с защитой от двойного клика
function wireUpUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    let undoClickTimeout = null;
    let redoClickTimeout = null;
    
    if (undoBtn) {
        undoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Защита от двойного клика
            if (undoClickTimeout) {
                clearTimeout(undoClickTimeout);
            }
            
            undoBtn.classList.add('active');
            window.undo();
            
            undoClickTimeout = setTimeout(() => {
                undoBtn.classList.remove('active');
                undoClickTimeout = null;
            }, 200);
        });
    }
    
    if (redoBtn) {
        redoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Защита от двойного клика
            if (redoClickTimeout) {
                clearTimeout(redoClickTimeout);
            }
            
            redoBtn.classList.add('active');
            window.redo();
            
            redoClickTimeout = setTimeout(() => {
                redoBtn.classList.remove('active');
                redoClickTimeout = null;
            }, 200);
        });
    }
}

// Modify commitHistory function to use pushHistory with debouncing
window.commitHistory = function() {
    if (typeof window.pushHistory === 'function' && !window.isRestoringState) {
        // Отменяем предыдущий таймаут
        clearTimeout(window._historyTimeout);
        
        // Используем debouncing для группировки быстрых изменений
        window._historyTimeout = setTimeout(() => {
            window.pushHistory();
        }, 100);
    }
};

// Функция для принудительного сохранения истории (без debouncing)
window.forceHistory = function() {
    if (typeof window.pushHistory === 'function') {
        clearTimeout(window._historyTimeout);
        window.pushHistory();
    }
};

// Add this to the existing DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
    console.log('Setting up undo/redo system...');
    
    // Wire up existing buttons
    wireUpUndoRedoButtons();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Initialize history system
    initializeHistory();
    
    // Модифицируем функцию newCanvas для правильной работы с историей
    const originalNewCanvas = window.newCanvas;
    if (originalNewCanvas) {
        window.newCanvas = async function(...args) {
            const result = await originalNewCanvas.apply(this, args);
            if (result && result.ok) {
                // Сбрасываем историю для нового холста
                window.historyStack = [];
                window.historyIndex = -1;
                // Небольшая задержка чтобы SVG отрендерился
                setTimeout(() => {
                    window.pushHistory(true); // Принудительно сохраняем
                    console.log('History reset for new canvas');
                }, 100);
            }
            return result;
        };
    }
    
    // Обработчики для операций которые должны сохраняться в истории
    const operationsToTrack = [
        'createLayer',
        'deleteSelected',
        'groupSelection',
        'ungroupSelection',
        'alignSelected',
        'distributeSelected',
        'moveLayer',
        'renameLayer'
    ];
    
    operationsToTrack.forEach(funcName => {
        if (window[funcName]) {
            const originalFunc = window[funcName];
            window[funcName] = function(...args) {
                // Сохраняем состояние до операции
                window.commitHistory();
                const result = originalFunc.apply(this, args);
                // Сохраняем состояние после операции
                setTimeout(() => window.commitHistory(), 50);
                return result;
            };
        }
    });
    
    // Специальная обработка для импорта SVG
    const applyImportBtn = document.getElementById('applyImportBtn');
    if (applyImportBtn) {
        const originalClick = applyImportBtn.onclick;
        applyImportBtn.onclick = function(e) {
            window.commitHistory(); // Сохраняем состояние до импорта
            if (originalClick) originalClick.call(this, e);
            setTimeout(() => window.forceHistory(), 100); // Сохраняем после импорта
        };
    }
    
    // Обработка изменений в инспекторе
    const inspectorApply = document.getElementById('ins_apply');
    if (inspectorApply) {
        const originalApply = inspectorApply.onclick;
        inspectorApply.onclick = function(e) {
            window.commitHistory();
            if (originalApply) originalApply.call(this, e);
        };
    }
    
    // Обновляем состояние кнопок при изменениях
    const observer = new MutationObserver(() => {
        updateUndoRedoButtons();
    });
    
    // Наблюдаем за изменениями в SVG
    const svgCanvas = document.getElementById('svgCanvas');
    if (svgCanvas) {
        observer.observe(svgCanvas, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['transform', 'fill', 'stroke', 'stroke-width', 'd', 'points', 'x', 'y', 'width', 'height']
        });
        
        // Автоматически сохраняем историю при изменениях SVG
        svgCanvas.addEventListener('DOMSubtreeModified', () => {
            if (!window.isRestoringState) {
                window.commitHistory();
            }
        });
    }
    
    console.log('Undo/redo system initialized');
});

// Добавим CSS для визуальной обратной связи
const style = document.createElement('style');
style.textContent = `
    #undoBtn.active, #redoBtn.active {
        background: linear-gradient(to bottom, #2a5fa8, #1a4f98) !important;
        transform: scale(0.95) !important;
        transition: transform 0.1s ease !important;
    }
    
    #undoBtn:focus, #redoBtn:focus {
        outline: 2px solid #4a90e2;
        outline-offset: 2px;
    }
`;
document.head.appendChild(style);


// АНИМАЦИЯ
// --- Анимация SMIL ---
window.animationSystem = {
    isPlaying: false,
    currentFrame: 0,
    totalFrames: 10,
    fps: 24,
    interval: null,
    keyframes: [],
    
    // Инициализация анимационной панели
    initAnimationPanel: function() {
        // Создаем панель анимации
        const animationPanel = document.createElement('div');
        animationPanel.id = 'animationPanel';
        animationPanel.className = 'animation-panel';
        animationPanel.style.display = 'none';
        animationPanel.style.marginTop = '15px';
        animationPanel.innerHTML = `
            <strong>Анимация</strong><br><br>
            <div id="animation-content">
                <div style="color:#666; margin-top:6px;">Выберите элемент для анимации</div>
            </div>
        `;
        
        // Добавляем в контейнер настроек
        const settingsContainer = document.querySelector('.toolbar-settings-container');
        if (settingsContainer) {
            // Находим позицию после inspectorPanel
            const inspectorPanel = document.getElementById('inspectorPanel');
            if (inspectorPanel) {
                settingsContainer.insertBefore(animationPanel, inspectorPanel.nextSibling);
            } else {
                settingsContainer.appendChild(animationPanel);
            }
        }
        
        // Добавляем вкладку для анимации
        this.addAnimationTab();
    },
    
    // Добавляем вкладку анимации
    addAnimationTab: function() {
        const tabsContainer = document.querySelector('.toolbar-settings-container > div:first-child');
        if (!tabsContainer) return;
        
        const animationTab = document.createElement('button');
        animationTab.id = 'tab-animation';
        animationTab.className = 'right-tab';
        animationTab.style.padding = '6px 8px';
        animationTab.textContent = 'Анимация';
        
        // Вставляем после вкладки инспектора
        const inspectorTab = document.getElementById('tab-inspector');
        if (inspectorTab) {
            inspectorTab.parentNode.insertBefore(animationTab, inspectorTab.nextSibling);
        } else {
            tabsContainer.appendChild(animationTab);
        }
        
        // Обработчик клика на вкладку
        animationTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.showAnimationTab();
        });
    },
    
    // Показать вкладку анимации
    showAnimationTab: function() {
        // Показать панель анимации, скрыть остальные
        document.getElementById('animationPanel').style.display = 'block';
        document.getElementById('layersPanel').style.display = 'none';
        document.getElementById('inspectorPanel').style.display = 'none';
        
        // Обновить классы вкладок
        document.querySelectorAll('.right-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById('tab-animation').classList.add('active');
        
        // Обновить контент анимации
        this.updateAnimationContent();
    },
    
    // Обновить контент анимации
    updateAnimationContent: function() {
        const content = document.getElementById('animation-content');
        if (!content) return;
        
        if (!window.selectedElement) {
            content.innerHTML = '<div style="color:#666; margin-top:6px;">Выберите элемент для анимации</div>';
            return;
        }
        
        const anim = this.getAnimationForElement(window.selectedElement);
        
        if (anim) {
            this.showAnimationProperties(anim);
        } else {
            this.showAnimationCreationUI();
        }
    },
    
    // Создать новую анимацию
    createAnimation: function(element, animationType = 'translate') {
        if (!element) return null;
        
        // Проверяем, есть ли уже анимация
        const existingAnim = element.querySelector('animate, animateTransform, animateMotion');
        if (existingAnim) {
            if (confirm('У элемента уже есть анимация. Заменить?')) {
                existingAnim.remove();
            } else {
                return existingAnim;
            }
        }
        
        let animation;
        const ns = 'http://www.w3.org/2000/svg';
        
        switch(animationType) {
            case 'translate':
                animation = document.createElementNS(ns, 'animateTransform');
                animation.setAttribute('attributeName', 'transform');
                animation.setAttribute('type', 'translate');
                animation.setAttribute('from', '0,0');
                animation.setAttribute('to', '100,100');
                animation.setAttribute('dur', '2s');
                animation.setAttribute('repeatCount', 'indefinite');
                break;
                
            case 'rotate':
                animation = document.createElementNS(ns, 'animateTransform');
                animation.setAttribute('attributeName', 'transform');
                animation.setAttribute('type', 'rotate');
                animation.setAttribute('from', '0');
                animation.setAttribute('to', '360');
                animation.setAttribute('dur', '3s');
                animation.setAttribute('repeatCount', 'indefinite');
                break;
                
            case 'scale':
                animation = document.createElementNS(ns, 'animateTransform');
                animation.setAttribute('attributeName', 'transform');
                animation.setAttribute('type', 'scale');
                animation.setAttribute('from', '1');
                animation.setAttribute('to', '2');
                animation.setAttribute('dur', '1.5s');
                animation.setAttribute('repeatCount', 'indefinite');
                break;
                
            case 'opacity':
                animation = document.createElementNS(ns, 'animate');
                animation.setAttribute('attributeName', 'opacity');
                animation.setAttribute('from', '1');
                animation.setAttribute('to', '0');
                animation.setAttribute('dur', '1s');
                animation.setAttribute('repeatCount', 'indefinite');
                break;
                
            case 'color':
                animation = document.createElementNS(ns, 'animate');
                animation.setAttribute('attributeName', 'fill');
                animation.setAttribute('from', '#ff0000');
                animation.setAttribute('to', '#0000ff');
                animation.setAttribute('dur', '2s');
                animation.setAttribute('repeatCount', 'indefinite');
                break;
                
            case 'path':
                animation = document.createElementNS(ns, 'animateMotion');
                animation.setAttribute('path', 'M0,0 L100,100');
                animation.setAttribute('dur', '3s');
                animation.setAttribute('repeatCount', 'indefinite');
                break;
        }
        
        if (animation) {
            animation.id = 'anim_' + Math.random().toString(36).substr(2, 9);
            element.insertBefore(animation, element.firstChild);
            this.updateAnimationContent();
            commitHistory();
        }
        
        return animation;
    },
    
    // Получить анимацию элемента
    getAnimationForElement: function(element) {
        return element ? element.querySelector('animate, animateTransform, animateMotion') : null;
    },
    
    // Показать свойства анимации
    showAnimationProperties: function(animation) {
        const content = document.getElementById('animation-content');
        if (!content) return;
        
        const tagName = animation.tagName.toLowerCase();
        let html = `
            <div class="animation-properties">
                <label>Тип: <span id="anim-type">${tagName}</span></label><br>
                <label>Длительность (s): <input type="number" id="anim-duration" value="${parseFloat(animation.getAttribute('dur') || '2')}" step="0.1" min="0.1"></label><br>
                <label>Повторений: <input type="text" id="anim-repeat" value="${animation.getAttribute('repeatCount') || 'indefinite'}"></label><br>
        `;
        
        if (tagName === 'animatetransform') {
            const type = animation.getAttribute('type');
            html += `<label>Тип трансформации: ${type}</label><br>`;
            
            if (type === 'translate') {
                const from = animation.getAttribute('from') || '0,0';
                const to = animation.getAttribute('to') || '100,100';
                html += `
                    <label>Начало (x,y): <input type="text" id="anim-from" value="${from}"></label><br>
                    <label>Конец (x,y): <input type="text" id="anim-to" value="${to}"></label><br>
                `;
            } else if (type === 'rotate') {
                html += `
                    <label>Начальный угол: <input type="number" id="anim-from" value="${animation.getAttribute('from') || '0'}"></label><br>
                    <label>Конечный угол: <input type="number" id="anim-to" value="${animation.getAttribute('to') || '360'}"></label><br>
                `;
            } else if (type === 'scale') {
                html += `
                    <label>Начальный масштаб: <input type="number" id="anim-from" value="${animation.getAttribute('from') || '1'}" step="0.1"></label><br>
                    <label>Конечный масштаб: <input type="number" id="anim-to" value="${animation.getAttribute('to') || '2'}" step="0.1"></label><br>
                `;
            }
        } else if (tagName === 'animate') {
            const attrName = animation.getAttribute('attributeName');
            html += `<label>Атрибут: ${attrName}</label><br>`;
            html += `
                <label>Начальное значение: <input type="text" id="anim-from" value="${animation.getAttribute('from') || ''}"></label><br>
                <label>Конечное значение: <input type="text" id="anim-to" value="${animation.getAttribute('to') || ''}"></label><br>
            `;
        }
        
        html += `
                <label>Задержка (s): <input type="number" id="anim-delay" value="${parseFloat(animation.getAttribute('begin') || '0')}" step="0.1" min="0"></label><br>
                <label>Функция времени: 
                    <select id="anim-easing">
                        <option value="linear" ${animation.getAttribute('calcMode') === 'linear' ? 'selected' : ''}>linear</option>
                        <option value="ease" ${!animation.getAttribute('calcMode') || animation.getAttribute('calcMode') === 'ease' ? 'selected' : ''}>ease</option>
                        <option value="ease-in" ${animation.getAttribute('calcMode') === 'ease-in' ? 'selected' : ''}>ease-in</option>
                        <option value="ease-out" ${animation.getAttribute('calcMode') === 'ease-out' ? 'selected' : ''}>ease-out</option>
                        <option value="ease-in-out" ${animation.getAttribute('calcMode') === 'ease-in-out' ? 'selected' : ''}>ease-in-out</option>
                    </select>
                </label><br>
                <div class="animation-controls" style="display:flex; gap:10px; margin-top:15px;">
                    <button id="anim-update" class="btn-primary" style="flex:1;">Обновить</button>
                    <button id="anim-remove" class="btn-danger" style="flex:1;">Удалить</button>
                    <button id="anim-preview" class="btn-secondary" style="flex:1;">Предпросмотр</button>
                </div>
                <hr>
                <button id="show-keyframe-editor" style="width:100%; margin-top:10px; padding:8px;">Покадровая анимация</button>
            </div>
        `;
        
        content.innerHTML = html;
        
        // Назначаем обработчики
        document.getElementById('anim-update').onclick = () => this.updateAnimationProperties(animation);
        document.getElementById('anim-remove').onclick = () => {
            animation.remove();
            this.updateAnimationContent();
            commitHistory();
        };
        document.getElementById('anim-preview').onclick = () => this.previewAnimation(animation);
        document.getElementById('show-keyframe-editor').onclick = () => this.showKeyframeEditor();
    },
    
    // Показать UI создания анимации
    showAnimationCreationUI: function() {
        const content = document.getElementById('animation-content');
        if (!content) return;
        
        const html = `
            <div class="animation-creation">
                <p>Создать новую анимацию для выбранного элемента</p>
                <label>Тип анимации:</label><br>
                <select id="anim-type-select" style="width:100%; padding:6px; margin-bottom:10px;">
                    <option value="translate">Перемещение</option>
                    <option value="rotate">Вращение</option>
                    <option value="scale">Масштабирование</option>
                    <option value="opacity">Прозрачность</option>
                    <option value="color">Цвет заливки</option>
                    <option value="path">Движение по пути</option>
                </select>
                
                <div id="anim-params" style="margin-bottom:15px;">
                    <!-- Параметры будут добавлены динамически -->
                </div>
                
                <div style="display:flex; gap:10px;">
                    <button id="anim-create" class="btn-primary" style="flex:1;">Создать анимацию</button>
                    <button id="show-keyframe-editor" class="btn-secondary" style="flex:1;">Покадровая анимация</button>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
        
        // Обработчик выбора типа анимации
        document.getElementById('anim-type-select').onchange = (e) => {
            this.showAnimationParameters(e.target.value);
        };
        
        // Обработчик создания анимации
        document.getElementById('anim-create').onclick = () => {
            const type = document.getElementById('anim-type-select').value;
            const anim = this.createAnimation(window.selectedElement, type);
            if (anim) {
                this.updateAnimationContent();
            }
        };
        
        // Обработчик покадровой анимации
        document.getElementById('show-keyframe-editor').onclick = () => this.showKeyframeEditor();
        
        // Показать параметры по умолчанию
        this.showAnimationParameters('translate');
    },
    
    // Показать параметры для типа анимации
    showAnimationParameters: function(type) {
        const paramsDiv = document.getElementById('anim-params');
        if (!paramsDiv) return;
        
        let html = '<label>Параметры:</label><br>';
        
        switch(type) {
            case 'translate':
                html += `
                    <label>Начальная позиция (x,y): <input type="text" id="anim-from" value="0,0" style="width:100%; padding:4px;"></label><br>
                    <label>Конечная позиция (x,y): <input type="text" id="anim-to" value="100,100" style="width:100%; padding:4px;"></label><br>
                    <label>Длительность (s): <input type="number" id="anim-dur" value="2" step="0.1" min="0.1" style="width:100%; padding:4px;"></label>
                `;
                break;
                
            case 'rotate':
                html += `
                    <label>Начальный угол: <input type="number" id="anim-from" value="0" style="width:100%; padding:4px;"></label><br>
                    <label>Конечный угол: <input type="number" id="anim-to" value="360" style="width:100%; padding:4px;"></label><br>
                    <label>Длительность (s): <input type="number" id="anim-dur" value="3" step="0.1" min="0.1" style="width:100%; padding:4px;"></label>
                `;
                break;
                
            case 'scale':
                html += `
                    <label>Начальный масштаб: <input type="number" id="anim-from" value="1" step="0.1" style="width:100%; padding:4px;"></label><br>
                    <label>Конечный масштаб: <input type="number" id="anim-to" value="2" step="0.1" style="width:100%; padding:4px;"></label><br>
                    <label>Длительность (s): <input type="number" id="anim-dur" value="1.5" step="0.1" min="0.1" style="width:100%; padding:4px;"></label>
                `;
                break;
                
            case 'opacity':
                html += `
                    <label>Начальная прозрачность: <input type="number" id="anim-from" value="1" min="0" max="1" step="0.1" style="width:100%; padding:4px;"></label><br>
                    <label>Конечная прозрачность: <input type="number" id="anim-to" value="0" min="0" max="1" step="0.1" style="width:100%; padding:4px;"></label><br>
                    <label>Длительность (s): <input type="number" id="anim-dur" value="1" step="0.1" min="0.1" style="width:100%; padding:4px;"></label>
                `;
                break;
                
            case 'color':
                html += `
                    <label>Начальный цвет: <input type="color" id="anim-from" value="#ff0000" style="width:100%; padding:4px;"></label><br>
                    <label>Конечный цвет: <input type="color" id="anim-to" value="#0000ff" style="width:100%; padding:4px;"></label><br>
                    <label>Длительность (s): <input type="number" id="anim-dur" value="2" step="0.1" min="0.1" style="width:100%; padding:4px;"></label>
                `;
                break;
                
            case 'path':
                html += `
                    <label>Путь (SVG path data): <textarea id="anim-path" rows="3" style="width:100%; padding:4px;">M0,0 L100,100</textarea></label><br>
                    <label>Длительность (s): <input type="number" id="anim-dur" value="3" step="0.1" min="0.1" style="width:100%; padding:4px;"></label>
                `;
                break;
        }
        
        paramsDiv.innerHTML = html;
    },
    
    // Обновить свойства анимации
    updateAnimationProperties: function(animation) {
        try {
            const dur = document.getElementById('anim-duration').value;
            const repeat = document.getElementById('anim-repeat').value;
            const delay = document.getElementById('anim-delay').value;
            const easing = document.getElementById('anim-easing').value;
            
            animation.setAttribute('dur', dur + 's');
            animation.setAttribute('repeatCount', repeat);
            animation.setAttribute('begin', delay + 's');
            animation.setAttribute('calcMode', easing);
            
            // Обновляем from/to если есть
            const fromInput = document.getElementById('anim-from');
            const toInput = document.getElementById('anim-to');
            
            if (fromInput && toInput) {
                animation.setAttribute('from', fromInput.value);
                animation.setAttribute('to', toInput.value);
            }
            
            commitHistory();
            alert('Анимация обновлена');
            
        } catch (error) {
            console.error('Ошибка обновления анимации:', error);
            alert('Ошибка обновления анимации');
        }
    },
    
    // Предпросмотр анимации
    previewAnimation: function(animation) {
        // Временно запускаем анимацию
        animation.beginElement();
        
        // Останавливаем через 5 секунд
        setTimeout(() => {
            animation.endElement();
        }, 5000);
    },
    
    // Показать редактор покадровой анимации
    showKeyframeEditor: function() {
        if (!window.selectedElement) {
            alert('Выберите элемент для анимации');
            return;
        }
        
        const content = document.getElementById('animation-content');
        if (!content) return;
        
        // Инициализируем ключевые кадры
        this.keyframes = [
            { 
                time: 0, 
                transform: window.selectedElement.getAttribute('transform') || '', 
                opacity: window.selectedElement.getAttribute('opacity') || '1',
                fill: window.selectedElement.getAttribute('fill') || '#000000'
            }
        ];
        
        const html = `
            <div class="keyframe-editor">
                <h4 style="margin-top:0;">Покадровая анимация</h4>
                
                <div style="display:flex; gap:8px; margin-bottom:15px;">
                    <button id="add-keyframe" style="flex:1; padding:6px;">+ Добавить кадр</button>
                    <button id="remove-keyframe" style="flex:1; padding:6px;">- Удалить кадр</button>
                </div>
                
                <div id="keyframes-list" style="max-height:200px; overflow-y:auto; border:1px solid #ddd; padding:8px; margin-bottom:15px;">
                    <!-- Список кадров будет здесь -->
                </div>
                
                <div style="margin-bottom:15px;">
                    <label>FPS: <input type="number" id="anim-fps" value="24" min="1" max="60" style="width:70px;"></label>
                    <label style="margin-left:10px;">Длительность (s): <input type="number" id="anim-total-duration" value="2" step="0.1" min="0.1" style="width:70px;"></label>
                </div>
                
                <div style="display:flex; gap:10px;">
                    <button id="preview-keyframes" class="btn-secondary" style="flex:1;">Предпросмотр</button>
                    <button id="apply-keyframes" class="btn-primary" style="flex:1;">Применить</button>
                    <button id="back-to-animation" class="btn-secondary" style="flex:1;">Назад</button>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
        
        // Рендерим список кадров
        this.renderKeyframesList();
        
        // Обработчики
        document.getElementById('add-keyframe').onclick = () => this.addKeyframe();
        document.getElementById('remove-keyframe').onclick = () => this.removeKeyframe();
        document.getElementById('preview-keyframes').onclick = () => this.previewKeyframes();
        document.getElementById('apply-keyframes').onclick = () => this.applyKeyframeAnimation();
        document.getElementById('back-to-animation').onclick = () => this.updateAnimationContent();
    },
    
    // Добавить ключевой кадр
    addKeyframe: function() {
        if (!window.selectedElement) return;
        
        const fps = parseInt(document.getElementById('anim-fps').value) || 24;
        const totalDuration = parseFloat(document.getElementById('anim-total-duration').value) || 2;
        const totalFrames = Math.floor(totalDuration * fps);
        
        const newTime = this.keyframes.length / totalFrames * totalDuration;
        
        this.keyframes.push({
            time: newTime,
            transform: window.selectedElement.getAttribute('transform') || '',
            opacity: window.selectedElement.getAttribute('opacity') || '1',
            fill: window.selectedElement.getAttribute('fill') || '#000000'
        });
        
        this.renderKeyframesList();
    },
    
    // Удалить ключевой кадр
    removeKeyframe: function() {
        if (this.keyframes.length > 1) {
            this.keyframes.pop();
            this.renderKeyframesList();
        }
    },
    
    // Рендерить список кадров
    renderKeyframesList: function() {
        const list = document.getElementById('keyframes-list');
        if (!list) return;
        
        let html = '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
        html += '<tr><th style="border-bottom:1px solid #ddd; padding:4px;">Кадр</th><th style="border-bottom:1px solid #ddd; padding:4px;">Время (s)</th><th style="border-bottom:1px solid #ddd; padding:4px;">Трансформация</th></tr>';
        
        this.keyframes.forEach((frame, index) => {
            html += `
                <tr>
                    <td style="border-bottom:1px solid #eee; padding:4px;">${index + 1}</td>
                    <td style="border-bottom:1px solid #eee; padding:4px;"><input type="number" value="${frame.time.toFixed(2)}" step="0.1" onchange="window.animationSystem.updateKeyframeTime(${index}, this.value)" style="width:100%; box-sizing:border-box; padding:2px;"></td>
                    <td style="border-bottom:1px solid #eee; padding:4px;"><input type="text" value="${frame.transform}" onchange="window.animationSystem.updateKeyframeTransform(${index}, this.value)" style="width:100%; box-sizing:border-box; padding:2px;"></td>
                </tr>
            `;
        });
        
        html += '</table>';
        list.innerHTML = html;
    },
    
    // Обновить время ключевого кадра
    updateKeyframeTime: function(index, time) {
        if (this.keyframes[index]) {
            this.keyframes[index].time = parseFloat(time);
            // Сортируем кадры по времени
            this.keyframes.sort((a, b) => a.time - b.time);
            this.renderKeyframesList();
        }
    },
    
    // Обновить трансформацию ключевого кадра
    updateKeyframeTransform: function(index, transform) {
        if (this.keyframes[index]) {
            this.keyframes[index].transform = transform;
        }
    },
    
    // Предпросмотр покадровой анимации
    previewKeyframes: function() {
        if (!window.selectedElement) return;
        
        const originalTransform = window.selectedElement.getAttribute('transform') || '';
        const originalOpacity = window.selectedElement.getAttribute('opacity') || '1';
        
        // Анимируем через requestAnimationFrame
        const fps = parseInt(document.getElementById('anim-fps').value) || 24;
        const totalDuration = parseFloat(document.getElementById('anim-total-duration').value) || 2;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = (currentTime - startTime) / 1000;
            
            if (elapsed < totalDuration) {
                // Находим текущие значения
                const progress = elapsed / totalDuration;
                const frame = this.getInterpolatedFrame(progress);
                
                if (frame.transform) {
                    window.selectedElement.setAttribute('transform', frame.transform);
                }
                if (frame.opacity) {
                    window.selectedElement.setAttribute('opacity', frame.opacity);
                }
                
                requestAnimationFrame(animate);
            } else {
                // Восстанавливаем исходное состояние
                window.selectedElement.setAttribute('transform', originalTransform);
                window.selectedElement.setAttribute('opacity', originalOpacity);
            }
        };
        
        requestAnimationFrame(animate);
    },
    
    // Получить интерполированный кадр
    getInterpolatedFrame: function(progress) {
        const totalTime = progress * this.getMaxTime();
        
        // Находим два ближайших кадра
        let prevFrame = this.keyframes[0];
        let nextFrame = this.keyframes[this.keyframes.length - 1];
        
        for (let i = 0; i < this.keyframes.length - 1; i++) {
            if (this.keyframes[i].time <= totalTime && this.keyframes[i + 1].time >= totalTime) {
                prevFrame = this.keyframes[i];
                nextFrame = this.keyframes[i + 1];
                break;
            }
        }
        
        // Интерполируем
        const t = (totalTime - prevFrame.time) / (nextFrame.time - prevFrame.time || 1);
        
        return {
            transform: prevFrame.transform, // Упрощенная интерполяция
            opacity: prevFrame.opacity + (nextFrame.opacity - prevFrame.opacity) * t
        };
    },
    
    // Получить максимальное время
    getMaxTime: function() {
        return Math.max(...this.keyframes.map(f => f.time));
    },
    
    // Применить покадровую анимацию
    applyKeyframeAnimation: function() {
        if (!window.selectedElement) return;
        
        // Удаляем существующие анимации
        const existingAnims = window.selectedElement.querySelectorAll('animate, animateTransform, animateMotion');
        existingAnims.forEach(anim => anim.remove());
        
        // Создаем анимацию для transform
        if (this.keyframes.some(f => f.transform)) {
            const animTransform = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform');
            animTransform.setAttribute('attributeName', 'transform');
            animTransform.setAttribute('type', 'translate');
            
            // Создаем values и keyTimes
            const values = this.keyframes.map(f => f.transform || '').join(';');
            const keyTimes = this.keyframes.map(f => (f.time / this.getMaxTime()).toFixed(3)).join(';');
            
            animTransform.setAttribute('values', values);
            animTransform.setAttribute('keyTimes', keyTimes);
            animTransform.setAttribute('dur', this.getMaxTime() + 's');
            animTransform.setAttribute('repeatCount', 'indefinite');
            animTransform.setAttribute('calcMode', 'discrete');
            
            window.selectedElement.insertBefore(animTransform, window.selectedElement.firstChild);
        }
        
        // Создаем анимацию для opacity
        if (this.keyframes.some(f => f.opacity)) {
            const animOpacity = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animOpacity.setAttribute('attributeName', 'opacity');
            
            const values = this.keyframes.map(f => f.opacity || '1').join(';');
            const keyTimes = this.keyframes.map(f => (f.time / this.getMaxTime()).toFixed(3)).join(';');
            
            animOpacity.setAttribute('values', values);
            animOpacity.setAttribute('keyTimes', keyTimes);
            animOpacity.setAttribute('dur', this.getMaxTime() + 's');
            animOpacity.setAttribute('repeatCount', 'indefinite');
            animOpacity.setAttribute('calcMode', 'discrete');
            
            window.selectedElement.insertBefore(animOpacity, window.selectedElement.firstChild);
        }
        
        commitHistory();
        alert('Покадровая анимация применена');
        this.updateAnimationContent();
    }
};

// Обновляем функцию refreshLayers для обновления анимационной панели
const originalRefreshLayers = window.refreshLayers;
window.refreshLayers = function() {
    originalRefreshLayers.apply(this);
    
    // Обновляем анимационную панель если она активна
    if (document.getElementById('tab-animation') && 
        document.getElementById('tab-animation').classList.contains('active')) {
        window.animationSystem.updateAnimationContent();
    }
};

// Обновляем функцию updateInspectorFor
const originalUpdateInspectorFor = window.updateInspectorFor;
window.updateInspectorFor = function(elem) {
    originalUpdateInspectorFor.apply(this, arguments);
    
    // Обновляем анимационную панель если она активна
    if (document.getElementById('tab-animation') && 
        document.getElementById('tab-animation').classList.contains('active')) {
        window.animationSystem.updateAnimationContent();
    }
};

// Обновляем функцию showRightTab
const originalShowRightTab = window.showRightTab;
window.showRightTab = function(name) {
    originalShowRightTab.apply(this, arguments);
    
    // Добавляем обработку вкладки анимации
    const layers = document.getElementById('layersPanel');
    const inspector = document.getElementById('inspectorPanel');
    const animationPanel = document.getElementById('animationPanel');
    
    if (!animationPanel) return;
    
    if (name === 'animation') {
        if (layers) layers.style.display = 'none';
        if (inspector) inspector.style.display = 'none';
        if (animationPanel) animationPanel.style.display = 'block';
        // Обновляем классы вкладок
        document.querySelectorAll('.right-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const animationTab = document.getElementById('tab-animation');
        if (animationTab) animationTab.classList.add('active');
        
        // Обновляем контент анимации
        window.animationSystem.updateAnimationContent();
    } else if (name === 'inspector') {
        if (animationPanel) animationPanel.style.display = 'none';
    } else if (name === 'layers') {
        if (animationPanel) animationPanel.style.display = 'none';
    }
};

// Инициализируем систему анимации при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.animationSystem.initAnimationPanel();
    
    // Добавляем CSS стили для анимации
    const style = document.createElement('style');
    style.textContent = `
        .animation-panel {
            border: 1px solid #ddd;
            padding: 8px;
            width: 100%;
            box-sizing: border-box;
        }
        
        .btn-primary {
            background: #4a6fa5;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .btn-danger {
            background: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .btn-primary:hover { background: #3a5a8c; }
        .btn-secondary:hover { background: #5a6268; }
        .btn-danger:hover { background: #c82333; }
        
        .right-tab.active {
            background: #4a6fa5;
            color: white;
        }
        
        .animation-properties input,
        .animation-properties select,
        .animation-creation input,
        .animation-creation select {
            width: 100%;
            padding: 4px;
            border: 1px solid #ddd;
            border-radius: 3px;
            box-sizing: border-box;
            margin-bottom: 8px;
        }
        
        .keyframe-editor input[type="number"],
        .keyframe-editor input[type="text"] {
            padding: 4px;
            border: 1px solid #ddd;
            border-radius: 3px;
        }
    `;
    document.head.appendChild(style);
});

// Добавляем экспортируемую функцию для отображения вкладки анимации
window.showAnimationPanel = function() {
    window.showRightTab('animation');
};



// ГРАДИЕНТЫ И ПАТТЕРНЫ
// --- Градиенты и Паттерны ---
window.gradientSystem = {
    gradients: [],
    patterns: [],
    currentGradientType: 'linear',
    
    // Инициализация системы градиентов
    init: function() {
        // Загружаем градиенты из SVG
        this.loadGradientsFromSVG();
        
        // Добавляем обработчики для вкладки градиентов
        this.setupGradientTab();
        
        // Инициализируем стандартные градиенты
        this.initDefaultGradients();
        
        console.log('Gradient system initialized');
    },
    
    // Настройка вкладки градиентов
    setupGradientTab: function() {
        const gradientTab = document.getElementById('tab-gradient');
        if (!gradientTab) {
            console.error('Tab gradient not found');
            return;
        }
        
        gradientTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.showGradientPanel();
        });
    },
    
    // Показать панель градиентов
    showGradientPanel: function() {
        // Показать панель градиентов, скрыть остальные
        document.getElementById('gradientPanel').style.display = 'block';
        document.getElementById('layersPanel').style.display = 'none';
        document.getElementById('inspectorPanel').style.display = 'none';
        
        const animationPanel = document.getElementById('animationPanel');
        if (animationPanel) animationPanel.style.display = 'none';
        
        // Обновить классы вкладок
        document.querySelectorAll('.right-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById('tab-gradient').classList.add('active');
        
        // Обновить контент градиентов
        this.updateGradientContent();
    },
    
    // Обновить контент градиентов
    updateGradientContent: function() {
        const content = document.getElementById('gradient-content');
        if (!content) {
            console.error('Gradient content element not found');
            return;
        }
        
        const html = this.getMainGradientUI();
        content.innerHTML = html;
        
        // Инициализируем UI
        this.initGradientUI();
    },
    
    // Получить основной UI градиентов
    getMainGradientUI: function() {
        return `
            <div class="gradient-tabs" style="display:flex; gap:4px; margin-bottom:15px;">
                <button id="grad-tab-linear" class="gradient-tab active" style="flex:1; padding:6px; background:#4a6fa5; color:white; border:none; border-radius:4px;">Линейный</button>
                <button id="grad-tab-radial" class="gradient-tab" style="flex:1; padding:6px; background:#6c757d; color:white; border:none; border-radius:4px;">Радиальный</button>
                <button id="grad-tab-pattern" class="gradient-tab" style="flex:1; padding:6px; background:#6c757d; color:white; border:none; border-radius:4px;">Паттерн</button>
                <button id="grad-tab-library" class="gradient-tab" style="flex:1; padding:6px; background:#6c757d; color:white; border:none; border-radius:4px;">Библиотека</button>
            </div>
            
            <div id="gradient-editor">
                ${this.getLinearGradientUI()}
            </div>
        `;
    },
    
    // Получить UI линейного градиента
    getLinearGradientUI: function() {
        return `
            <h4 style="margin-top:0;">Линейный градиент</h4>
            
            <div class="gradient-preview" id="linear-preview" 
                 style="width:100%; height:60px; border:1px solid #ddd; margin-bottom:15px; border-radius:4px; background:linear-gradient(to right, #ff0000, #0000ff);"></div>
            
            <div class="gradient-controls">
                <label style="display:block; margin-bottom:8px; font-size:14px;">
                    Угол (градусы): 
                    <input type="number" id="grad-angle" value="0" min="0" max="360" style="width:80px; padding:4px; border:1px solid #ddd; border-radius:3px;">
                </label>
                
                <div style="margin:10px 0; padding:10px; background:#f8f9fa; border-radius:4px;">
                    <label style="display:block; margin-bottom:5px; font-size:14px;">Начальная точка:</label>
                    <div style="display:flex; gap:10px;">
                        <label style="font-size:13px;">X: <input type="number" id="grad-x1" value="0" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                        <label style="font-size:13px;">Y: <input type="number" id="grad-y1" value="0" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                    </div>
                </div>
                
                <div style="margin:10px 0; padding:10px; background:#f8f9fa; border-radius:4px;">
                    <label style="display:block; margin-bottom:5px; font-size:14px;">Конечная точка:</label>
                    <div style="display:flex; gap:10px;">
                        <label style="font-size:13px;">X: <input type="number" id="grad-x2" value="100" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                        <label style="font-size:13px;">Y: <input type="number" id="grad-y2" value="0" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                    </div>
                </div>
                
                <div id="color-stops" style="margin:15px 0; padding:10px; background:#f8f9fa; border-radius:4px;">
                    <h5 style="margin-bottom:8px; margin-top:0;">Цветовые остановки:</h5>
                    <div class="color-stop" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:8px; background:white; border-radius:4px;">
                        <input type="color" value="#ff0000" class="stop-color" style="width:40px; height:40px; border:none; border-radius:4px; cursor:pointer;">
                        <input type="range" min="0" max="100" value="0" class="stop-offset" style="flex:1; height:6px;">
                        <span class="stop-value" style="min-width:30px; text-align:center; font-size:13px;">0%</span>
                        <input type="number" min="0" max="100" value="100" class="stop-opacity" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;" step="0.1">%
                        <button class="remove-stop" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">×</button>
                    </div>
                    <div class="color-stop" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:8px; background:white; border-radius:4px;">
                        <input type="color" value="#0000ff" class="stop-color" style="width:40px; height:40px; border:none; border-radius:4px; cursor:pointer;">
                        <input type="range" min="0" max="100" value="100" class="stop-offset" style="flex:1; height:6px;">
                        <span class="stop-value" style="min-width:30px; text-align:center; font-size:13px;">100%</span>
                        <input type="number" min="0" max="100" value="100" class="stop-opacity" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;" step="0.1">%
                        <button class="remove-stop" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">×</button>
                    </div>
                </div>
                
                <div style="display:flex; gap:8px; margin-top:15px;">
                    <button id="add-color-stop" style="flex:1; padding:8px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">+ Добавить остановку</button>
                    <button id="apply-to-selected" style="flex:1; padding:8px; background:#17a2b8; color:white; border:none; border-radius:4px; cursor:pointer;">Применить к выделенному</button>
                </div>
                
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <button id="create-gradient" style="flex:1; padding:8px; background:#4a6fa5; color:white; border:none; border-radius:4px; cursor:pointer;">Создать градиент</button>
                    <button id="save-gradient" style="flex:1; padding:8px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer;">Сохранить в библиотеку</button>
                </div>
            </div>
        `;
    },
    
    // Инициализация UI градиентов
    initGradientUI: function() {
        // Инициализация вкладок
        this.initGradientTabs();
        
        // Инициализация цветовых остановок
        this.initColorStops();
        
        // Инициализация кнопок
        this.initGradientButtons();
        
        // Обновление превью
        this.updateGradientPreview();
    },
    
    // Инициализация вкладок градиентов
    initGradientTabs: function() {
        const tabs = document.querySelectorAll('.gradient-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Убираем активный класс у всех вкладок
                tabs.forEach(t => {
                    t.style.background = '#6c757d';
                    t.classList.remove('active');
                });
                
                // Добавляем активный класс текущей вкладке
                tab.style.background = '#4a6fa5';
                tab.classList.add('active');
                
                // Показываем соответствующий редактор
                const tabId = tab.id;
                const editor = document.getElementById('gradient-editor');
                
                switch(tabId) {
                    case 'grad-tab-linear':
                        editor.innerHTML = this.getLinearGradientUI();
                        this.currentGradientType = 'linear';
                        break;
                    case 'grad-tab-radial':
                        editor.innerHTML = this.getRadialGradientUI();
                        this.currentGradientType = 'radial';
                        break;
                    case 'grad-tab-pattern':
                        editor.innerHTML = this.getPatternUI();
                        this.currentGradientType = 'pattern';
                        break;
                    case 'grad-tab-library':
                        editor.innerHTML = this.getGradientLibraryUI();
                        this.currentGradientType = 'library';
                        break;
                }
                
                // Реинициализируем UI
                setTimeout(() => {
                    this.initGradientUI();
                }, 10);
            });
        });
    },
    
    // Получить UI радиального градиента
    getRadialGradientUI: function() {
        return `
            <h4 style="margin-top:0;">Радиальный градиент</h4>
            
            <div class="gradient-preview" id="radial-preview" 
                 style="width:100%; height:60px; border:1px solid #ddd; margin-bottom:15px; border-radius:4px; background:radial-gradient(circle at center, #ff0000, #0000ff);"></div>
            
            <div class="gradient-controls">
                <div style="margin:10px 0; padding:10px; background:#f8f9fa; border-radius:4px;">
                    <label style="display:block; margin-bottom:5px; font-size:14px;">Центр:</label>
                    <div style="display:flex; gap:10px;">
                        <label style="font-size:13px;">X: <input type="number" id="radial-cx" value="50" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                        <label style="font-size:13px;">Y: <input type="number" id="radial-cy" value="50" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                    </div>
                </div>
                
                <div style="margin:10px 0; padding:10px; background:#f8f9fa; border-radius:4px;">
                    <label style="display:block; margin-bottom:5px; font-size:14px;">Радиус:</label>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <label style="font-size:13px;">R: <input type="number" id="radial-r" value="50" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                        <label style="font-size:13px;">FX: <input type="number" id="radial-fx" value="50" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                        <label style="font-size:13px;">FY: <input type="number" id="radial-fy" value="50" min="0" max="100" step="1" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;">%</label>
                    </div>
                </div>
                
                <div id="color-stops" style="margin:15px 0; padding:10px; background:#f8f9fa; border-radius:4px;">
                    <h5 style="margin-bottom:8px; margin-top:0;">Цветовые остановки:</h5>
                    <div class="color-stop" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:8px; background:white; border-radius:4px;">
                        <input type="color" value="#ff0000" class="stop-color" style="width:40px; height:40px; border:none; border-radius:4px; cursor:pointer;">
                        <input type="range" min="0" max="100" value="0" class="stop-offset" style="flex:1; height:6px;">
                        <span class="stop-value" style="min-width:30px; text-align:center; font-size:13px;">0%</span>
                        <input type="number" min="0" max="100" value="100" class="stop-opacity" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;" step="0.1">%
                        <button class="remove-stop" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">×</button>
                    </div>
                    <div class="color-stop" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:8px; background:white; border-radius:4px;">
                        <input type="color" value="#0000ff" class="stop-color" style="width:40px; height:40px; border:none; border-radius:4px; cursor:pointer;">
                        <input type="range" min="0" max="100" value="100" class="stop-offset" style="flex:1; height:6px;">
                        <span class="stop-value" style="min-width:30px; text-align:center; font-size:13px;">100%</span>
                        <input type="number" min="0" max="100" value="100" class="stop-opacity" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;" step="0.1">%
                        <button class="remove-stop" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">×</button>
                    </div>
                </div>
                
                <div style="display:flex; gap:8px; margin-top:15px;">
                    <button id="add-color-stop" style="flex:1; padding:8px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">+ Добавить остановку</button>
                    <button id="apply-to-selected" style="flex:1; padding:8px; background:#17a2b8; color:white; border:none; border-radius:4px; cursor:pointer;">Применить к выделенному</button>
                </div>
                
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <button id="create-gradient" style="flex:1; padding:8px; background:#4a6fa5; color:white; border:none; border-radius:4px; cursor:pointer;">Создать градиент</button>
                    <button id="save-gradient" style="flex:1; padding:8px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer;">Сохранить в библиотеку</button>
                </div>
            </div>
        `;
    },
    
    // Получить UI паттерна
    getPatternUI: function() {
        return `
            <h4 style="margin-top:0;">Паттерны</h4>
            
            <div class="pattern-preview" id="pattern-preview" 
                 style="width:100%; height:80px; border:1px solid #ddd; margin-bottom:15px; border-radius:4px; background-color:#f0f0f0; position:relative; overflow:hidden;">
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; background-image:url('data:image/svg+xml;utf8,<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20" fill="%23ff0000"/><circle cx="10" cy="10" r="5" fill="%230000ff"/></svg>');"></div>
            </div>
            
            <div class="pattern-controls">
                <label style="display:block; margin-bottom:8px; font-size:14px;">Тип паттерна:</label>
                <select id="pattern-type" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:4px;">
                    <option value="simple">Простой узор</option>
                    <option value="lines">Линии</option>
                    <option value="dots">Точки</option>
                    <option value="checkerboard">Шахматка</option>
                    <option value="custom">Пользовательский</option>
                </select>
                
                <div id="pattern-params" style="margin-bottom:15px; padding:10px; background:#f8f9fa; border-radius:4px;">
                    <div class="pattern-param" style="margin-bottom:10px;">
                        <label style="display:block; margin-bottom:5px; font-size:14px;">Размер паттерна:</label>
                        <div style="display:flex; gap:10px;">
                            <label style="font-size:13px;">Ширина: <input type="number" id="pattern-width" value="20" min="1" style="width:80px; padding:4px; border:1px solid #ddd; border-radius:3px;"> px</label>
                            <label style="font-size:13px;">Высота: <input type="number" id="pattern-height" value="20" min="1" style="width:80px; padding:4px; border:1px solid #ddd; border-radius:3px;"> px</label>
                        </div>
                    </div>
                    
                    <div class="pattern-param">
                        <label style="display:block; margin-bottom:5px; font-size:14px;">Цвета:</label>
                        <div style="display:flex; gap:10px;">
                            <label style="font-size:13px;">Цвет 1: <input type="color" id="pattern-color1" value="#ff0000" style="width:40px; height:40px; border:none; border-radius:4px; cursor:pointer;"></label>
                            <label style="font-size:13px;">Цвет 2: <input type="color" id="pattern-color2" value="#0000ff" style="width:40px; height:40px; border:none; border-radius:4px; cursor:pointer;"></label>
                        </div>
                    </div>
                </div>
                
                <div style="display:flex; gap:8px; margin-top:15px;">
                    <button id="create-pattern" style="flex:1; padding:8px; background:#4a6fa5; color:white; border:none; border-radius:4px; cursor:pointer;">Создать паттерн</button>
                    <button id="apply-to-selected" style="flex:1; padding:8px; background:#17a2b8; color:white; border:none; border-radius:4px; cursor:pointer;">Применить к выделенному</button>
                </div>
            </div>
        `;
    },
    
    // Получить UI библиотеки градиентов
    getGradientLibraryUI: function() {
        const gradients = this.gradients;
        let libraryHTML = '';
        
        if (gradients.length === 0) {
            libraryHTML = '<div style="text-align:center; color:#666; padding:20px;">Библиотека градиентов пуста</div>';
        } else {
            libraryHTML = gradients.map((grad, index) => `
                <div class="gradient-item" data-index="${index}" 
                     style="border:1px solid #ddd; padding:10px; cursor:pointer; border-radius:4px; margin-bottom:10px; background:white;">
                    <div style="height:40px; margin-bottom:8px; border-radius:3px; ${grad.preview || 'background:linear-gradient(to right, #ccc, #999)'}"></div>
                    <div style="font-size:13px; font-weight:bold; margin-bottom:4px;">${grad.name || 'Градиент ' + (index + 1)}</div>
                    <div style="font-size:11px; color:#666; margin-bottom:8px;">${grad.type === 'linear' ? 'Линейный' : 'Радиальный'}</div>
                    <div style="display:flex; gap:5px;">
                        <button class="apply-gradient" style="flex:1; padding:6px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;">Применить</button>
                        <button class="delete-gradient" style="padding:6px 10px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;">×</button>
                    </div>
                </div>
            `).join('');
        }
        
        return `
            <h4 style="margin-top:0;">Библиотека градиентов</h4>
            
            <div style="margin-bottom:15px;">
                <div style="display:flex; gap:8px;">
                    <input type="text" id="search-gradients" placeholder="Поиск градиентов..." style="flex:1; padding:8px; border:1px solid #ddd; border-radius:4px;">
                    <button id="refresh-library" style="padding:8px 12px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer;">Обновить</button>
                </div>
            </div>
            
            <div id="gradient-library" style="max-height:300px; overflow-y:auto; padding:5px;">
                ${libraryHTML}
            </div>
            
            <div style="margin-top:15px; padding:10px; background:#f8f9fa; border-radius:4px;">
                <h5 style="margin-top:0; margin-bottom:8px;">Предустановленные градиенты:</h5>
                <div id="preset-gradients" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
                    <div class="preset-gradient" data-gradient="linear-gradient(45deg, #ff0000, #0000ff)" 
                         style="height:40px; background:linear-gradient(45deg, #ff0000, #0000ff); border:1px solid #ddd; border-radius:4px; cursor:pointer;" 
                         title="Красно-синий диагональный"></div>
                    <div class="preset-gradient" data-gradient="linear-gradient(to right, #ff9900, #ffff00)" 
                         style="height:40px; background:linear-gradient(to right, #ff9900, #ffff00); border:1px solid #ddd; border-radius:4px; cursor:pointer;" 
                         title="Оранжево-желтый горизонтальный"></div>
                    <div class="preset-gradient" data-gradient="radial-gradient(circle at center, #00ff00, #008800)" 
                         style="height:40px; background:radial-gradient(circle at center, #00ff00, #008800); border:1px solid #ddd; border-radius:4px; cursor:pointer;" 
                         title="Зеленый радиальный"></div>
                    <div class="preset-gradient" data-gradient="linear-gradient(to bottom, #ff00ff, #880088)" 
                         style="height:40px; background:linear-gradient(to bottom, #ff00ff, #880088); border:1px solid #ddd; border-radius:4px; cursor:pointer;" 
                         title="Фиолетовый вертикальный"></div>
                    <div class="preset-gradient" data-gradient="linear-gradient(90deg, #ff0000, #ff9900, #ffff00, #00ff00, #0000ff, #ff00ff)" 
                         style="height:40px; background:linear-gradient(90deg, #ff0000, #ff9900, #ffff00, #00ff00, #0000ff, #ff00ff); border:1px solid #ddd; border-radius:4px; cursor:pointer;" 
                         title="Радужный"></div>
                    <div class="preset-gradient" data-gradient="linear-gradient(to right, #4a6fa5, #6a8fc5)" 
                         style="height:40px; background:linear-gradient(to right, #4a6fa5, #6a8fc5); border:1px solid #ddd; border-radius:4px; cursor:pointer;" 
                         title="Синий градиент"></div>
                </div>
            </div>
        `;
    },
    
    // Инициализация цветовых остановок
    initColorStops: function() {
        // Обработчики для существующих остановок
        document.querySelectorAll('.stop-offset').forEach(input => {
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                const valueSpan = e.target.parentElement.querySelector('.stop-value');
                if (valueSpan) {
                    valueSpan.textContent = value + '%';
                }
                this.updateGradientPreview();
            });
        });
        
        document.querySelectorAll('.stop-color, .stop-opacity').forEach(input => {
            input.addEventListener('input', () => {
                this.updateGradientPreview();
            });
        });
        
        document.querySelectorAll('.remove-stop').forEach(button => {
            button.addEventListener('click', (e) => {
                const stop = e.target.closest('.color-stop');
                if (stop && document.querySelectorAll('.color-stop').length > 2) {
                    stop.remove();
                    this.updateGradientPreview();
                }
            });
        });
        
        // Обработчик для добавления новой остановки
        const addStopBtn = document.getElementById('add-color-stop');
        if (addStopBtn) {
            addStopBtn.addEventListener('click', () => {
                this.addColorStop();
            });
        }
    },
    
    // Инициализация кнопок градиента
    initGradientButtons: function() {
        // Применить к выделенному
        const applyBtn = document.getElementById('apply-to-selected');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyGradientToSelected();
            });
        }
        
        // Создать градиент
        const createBtn = document.getElementById('create-gradient');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.createGradient();
            });
        }
        
        // Сохранить в библиотеку
        const saveBtn = document.getElementById('save-gradient');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveGradientToLibrary();
            });
        }
        
        // Создать паттерн
        const createPatternBtn = document.getElementById('create-pattern');
        if (createPatternBtn) {
            createPatternBtn.addEventListener('click', () => {
                this.createPattern();
            });
        }
        
        // Обновить библиотеку
        const refreshBtn = document.getElementById('refresh-library');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.updateGradientLibrary();
            });
        }
        
        // Применить пресет градиента
        document.querySelectorAll('.preset-gradient').forEach(preset => {
            preset.addEventListener('click', (e) => {
                const gradient = e.target.getAttribute('data-gradient');
                this.applyPresetGradient(gradient);
            });
        });
        
        // Обработчики для элементов библиотеки
        document.querySelectorAll('.apply-gradient').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.closest('.gradient-item').getAttribute('data-index'));
                this.applyGradientFromLibrary(index);
            });
        });
        
        document.querySelectorAll('.delete-gradient').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.closest('.gradient-item').getAttribute('data-index'));
                if (confirm('Удалить этот градиент из библиотеки?')) {
                    this.gradients.splice(index, 1);
                    this.updateGradientLibrary();
                }
            });
        });
    },
    
    // Обновить превью градиента
    updateGradientPreview: function() {
        const activeTab = document.querySelector('.gradient-tab.active');
        if (!activeTab) return;
        
        const tabId = activeTab.id;
        let preview;
        
        if (tabId === 'grad-tab-linear') {
            preview = document.getElementById('linear-preview');
        } else if (tabId === 'grad-tab-radial') {
            preview = document.getElementById('radial-preview');
        } else {
            return;
        }
        
        if (!preview) return;
        
        // Получаем значения цветовых остановок
        const stops = this.getColorStops();
        const gradientString = this.generateGradientString(stops, tabId === 'grad-tab-radial');
        
        if (gradientString) {
            preview.style.background = gradientString;
        }
    },
    
    // Получить цветовые остановки
    getColorStops: function() {
        const stops = [];
        const stopElements = document.querySelectorAll('.color-stop');
        
        stopElements.forEach(stop => {
            const color = stop.querySelector('.stop-color').value;
            const offset = stop.querySelector('.stop-offset').value + '%';
            const opacity = stop.querySelector('.stop-opacity').value;
            
            stops.push({
                color: color,
                offset: offset,
                opacity: opacity / 100
            });
        });
        
        return stops;
    },
    
    // Сгенерировать строку градиента
    generateGradientString: function(stops, isRadial = false) {
        if (stops.length < 2) return '';
        
        const stopStrings = stops.map(stop => {
            const rgba = this.hexToRgba(stop.color, stop.opacity);
            return `${rgba} ${stop.offset}`;
        }).join(', ');
        
        if (isRadial) {
            const cx = document.getElementById('radial-cx')?.value || 50;
            const cy = document.getElementById('radial-cy')?.value || 50;
            return `radial-gradient(circle at ${cx}% ${cy}%, ${stopStrings})`;
        } else {
            const angle = document.getElementById('grad-angle')?.value || 0;
            return `linear-gradient(${angle}deg, ${stopStrings})`;
        }
    },
    
    // Конвертировать HEX в RGBA
    hexToRgba: function(hex, opacity = 1) {
        hex = hex.replace('#', '');
        
        let r, g, b;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        }
        
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    },
    
    // Добавить цветовую остановку
    addColorStop: function() {
        const stopsContainer = document.getElementById('color-stops');
        if (!stopsContainer) return;
        
        const stopCount = stopsContainer.querySelectorAll('.color-stop').length;
        if (stopCount >= 10) return;
        
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        const offset = Math.floor(Math.random() * 100);
        
        const stopHTML = `
            <div class="color-stop" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:8px; background:white; border-radius:4px;">
                <input type="color" value="${randomColor}" class="stop-color" style="width:40px; height:40px; border:none; border-radius:4px; cursor:pointer;">
                <input type="range" min="0" max="100" value="${offset}" class="stop-offset" style="flex:1; height:6px;">
                <span class="stop-value" style="min-width:30px; text-align:center; font-size:13px;">${offset}%</span>
                <input type="number" min="0" max="100" value="100" class="stop-opacity" style="width:60px; padding:4px; border:1px solid #ddd; border-radius:3px;" step="0.1">%
                <button class="remove-stop" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">×</button>
            </div>
        `;
        
        stopsContainer.insertAdjacentHTML('beforeend', stopHTML);
        
        // Инициализируем обработчики для новой остановки
        const newStop = stopsContainer.lastElementChild;
        newStop.querySelector('.stop-offset').addEventListener('input', (e) => {
            const value = e.target.value;
            const valueSpan = e.target.parentElement.querySelector('.stop-value');
            if (valueSpan) valueSpan.textContent = value + '%';
            this.updateGradientPreview();
        });
        
        newStop.querySelector('.stop-color').addEventListener('input', () => this.updateGradientPreview());
        newStop.querySelector('.stop-opacity').addEventListener('input', () => this.updateGradientPreview());
        newStop.querySelector('.remove-stop').addEventListener('click', (e) => {
            const stop = e.target.closest('.color-stop');
            if (stop && stopsContainer.querySelectorAll('.color-stop').length > 2) {
                stop.remove();
                this.updateGradientPreview();
            }
        });
        
        this.updateGradientPreview();
    },
    
    // Применить градиент к выделенному элементу
    applyGradientToSelected: function() {
        if (!window.selectedElement) {
            alert('Выберите элемент для применения градиента');
            return;
        }
        
        const activeTab = document.querySelector('.gradient-tab.active');
        if (!activeTab) return;
        
        const tabId = activeTab.id;
        
        if (tabId === 'grad-tab-pattern') {
            this.applyPatternToSelected();
            return;
        }
        
        const stops = this.getColorStops();
        const gradientId = this.createSVGGradient(stops, tabId === 'grad-tab-radial');
        
        if (gradientId) {
            window.selectedElement.setAttribute('fill', `url(#${gradientId})`);
            commitHistory();
            alert('Градиент применен к выбранному элементу');
        }
    },
    
    // Создать SVG градиент
    createSVGGradient: function(stops, isRadial = false) {
        const svg = document.getElementById('svgCanvas');
        if (!svg) return '';
        
        // Получаем или создаем defs
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        
        // Создаем градиент
        const gradientId = 'gradient_' + Math.random().toString(36).substr(2, 9);
        let gradient;
        
        if (isRadial) {
            gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
            gradient.setAttribute('id', gradientId);
            gradient.setAttribute('cx', (document.getElementById('radial-cx')?.value || 50) + '%');
            gradient.setAttribute('cy', (document.getElementById('radial-cy')?.value || 50) + '%');
            gradient.setAttribute('r', (document.getElementById('radial-r')?.value || 50) + '%');
            
            const fx = document.getElementById('radial-fx')?.value;
            const fy = document.getElementById('radial-fy')?.value;
            if (fx) gradient.setAttribute('fx', fx + '%');
            if (fy) gradient.setAttribute('fy', fy + '%');
        } else {
            gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            gradient.setAttribute('id', gradientId);
            gradient.setAttribute('x1', (document.getElementById('grad-x1')?.value || 0) + '%');
            gradient.setAttribute('y1', (document.getElementById('grad-y1')?.value || 0) + '%');
            gradient.setAttribute('x2', (document.getElementById('grad-x2')?.value || 100) + '%');
            gradient.setAttribute('y2', (document.getElementById('grad-y2')?.value || 0) + '%');
        }
        
        // Добавляем цветовые остановки
        stops.forEach(stop => {
            const stopElement = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stopElement.setAttribute('offset', stop.offset);
            stopElement.setAttribute('stop-color', stop.color);
            stopElement.setAttribute('stop-opacity', stop.opacity);
            gradient.appendChild(stopElement);
        });
        
        // Добавляем градиент в defs
        defs.appendChild(gradient);
        
        return gradientId;
    },
    
    // Создать градиент
    createGradient: function() {
        const activeTab = document.querySelector('.gradient-tab.active');
        if (!activeTab) return;
        
        const tabId = activeTab.id;
        
        if (tabId === 'grad-tab-pattern') {
            this.createPattern();
            return;
        }
        
        const stops = this.getColorStops();
        const gradientId = this.createSVGGradient(stops, tabId === 'grad-tab-radial');
        
        if (gradientId) {
            // Сохраняем градиент в библиотеку
            const name = prompt('Введите название градиента:', `Градиент ${this.gradients.length + 1}`);
            if (!name) return;
            
            this.gradients.push({
                id: gradientId,
                type: tabId === 'grad-tab-radial' ? 'radial' : 'linear',
                stops: stops,
                name: name,
                preview: this.generateGradientString(stops, tabId === 'grad-tab-radial')
            });
            
            commitHistory();
            alert(`Градиент "${name}" создан`);
            
            // Обновляем библиотеку
            this.updateGradientLibrary();
        }
    },
    
    // Сохранить градиент в библиотеку
    saveGradientToLibrary: function() {
        const activeTab = document.querySelector('.gradient-tab.active');
        if (!activeTab) return;
        
        const tabId = activeTab.id;
        if (tabId === 'grad-tab-pattern') return;
        
        const stops = this.getColorStops();
        const name = prompt('Введите название для сохранения:', `Градиент ${this.gradients.length + 1}`);
        if (!name) return;
        
        this.gradients.push({
            type: tabId === 'grad-tab-radial' ? 'radial' : 'linear',
            stops: stops,
            name: name,
            preview: this.generateGradientString(stops, tabId === 'grad-tab-radial')
        });
        
        alert('Градиент сохранен в библиотеку');
        
        // Обновляем библиотеку если она открыта
        if (tabId === 'grad-tab-library') {
            this.updateGradientLibrary();
        }
    },
    
    // Создать паттерн
    createPattern: function() {
        const svg = document.getElementById('svgCanvas');
        if (!svg) return;
        
        // Получаем или создаем defs
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        
        const patternId = 'pattern_' + Math.random().toString(36).substr(2, 9);
        const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.setAttribute('id', patternId);
        pattern.setAttribute('width', document.getElementById('pattern-width')?.value || 20);
        pattern.setAttribute('height', document.getElementById('pattern-height')?.value || 20);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        
        // Добавляем элементы паттерна
        const type = document.getElementById('pattern-type')?.value || 'simple';
        this.addPatternElements(pattern, type);
        
        // Добавляем паттерн в defs
        defs.appendChild(pattern);
        
        // Сохраняем паттерн
        this.patterns.push({
            id: patternId,
            type: type,
            name: `Паттерн ${this.patterns.length + 1}`
        });
        
        commitHistory();
        alert(`Паттерн "${patternId}" создан`);
    },
    
    // Применить паттерн к выделенному элементу
    applyPatternToSelected: function() {
        if (!window.selectedElement) {
            alert('Выберите элемент для применения паттерна');
            return;
        }
        
        this.createPattern();
        const patternId = this.patterns[this.patterns.length - 1]?.id;
        
        if (patternId) {
            window.selectedElement.setAttribute('fill', `url(#${patternId})`);
            commitHistory();
            alert('Паттерн применен к выбранному элементу');
        }
    },
    
    // Добавить элементы паттерна
    addPatternElements: function(pattern, type) {
        const ns = 'http://www.w3.org/2000/svg';
        const color1 = document.getElementById('pattern-color1')?.value || '#ff0000';
        const color2 = document.getElementById('pattern-color2')?.value || '#0000ff';
        const width = parseInt(document.getElementById('pattern-width')?.value || 20);
        const height = parseInt(document.getElementById('pattern-height')?.value || 20);
        
        switch(type) {
            case 'simple':
                const rect = document.createElementNS(ns, 'rect');
                rect.setAttribute('width', width);
                rect.setAttribute('height', height);
                rect.setAttribute('fill', color1);
                pattern.appendChild(rect);
                break;
                
            case 'lines':
                for (let i = 0; i < height; i += 4) {
                    const line = document.createElementNS(ns, 'line');
                    line.setAttribute('x1', 0);
                    line.setAttribute('y1', i);
                    line.setAttribute('x2', width);
                    line.setAttribute('y2', i);
                    line.setAttribute('stroke', color1);
                    line.setAttribute('stroke-width', 1);
                    pattern.appendChild(line);
                }
                break;
                
            case 'dots':
                for (let x = 2; x < width; x += 6) {
                    for (let y = 2; y < height; y += 6) {
                        const circle = document.createElementNS(ns, 'circle');
                        circle.setAttribute('cx', x);
                        circle.setAttribute('cy', y);
                        circle.setAttribute('r', 1);
                        circle.setAttribute('fill', color1);
                        pattern.appendChild(circle);
                    }
                }
                break;
                
            case 'checkerboard':
                for (let x = 0; x < width; x += 10) {
                    for (let y = 0; y < height; y += 10) {
                        const rect = document.createElementNS(ns, 'rect');
                        rect.setAttribute('x', x);
                        rect.setAttribute('y', y);
                        rect.setAttribute('width', 10);
                        rect.setAttribute('height', 10);
                        rect.setAttribute('fill', (Math.floor(x/10) + Math.floor(y/10)) % 2 === 0 ? color1 : color2);
                        pattern.appendChild(rect);
                    }
                }
                break;
        }
    },
    
    // Применить пресет градиента
    applyPresetGradient: function(gradientString) {
        if (!window.selectedElement) {
            alert('Выберите элемент для применения градиента');
            return;
        }
        
        window.selectedElement.setAttribute('fill', gradientString);
        commitHistory();
        alert('Градиент применен');
    },
    
    // Обновить библиотеку градиентов
    updateGradientLibrary: function() {
        const library = document.getElementById('gradient-library');
        if (library) {
            library.innerHTML = this.gradients.length === 0 
                ? '<div style="text-align:center; color:#666; padding:20px;">Библиотека градиентов пуста</div>'
                : this.gradients.map((grad, index) => `
                    <div class="gradient-item" data-index="${index}" 
                         style="border:1px solid #ddd; padding:10px; cursor:pointer; border-radius:4px; margin-bottom:10px; background:white;">
                        <div style="height:40px; margin-bottom:8px; border-radius:3px; ${grad.preview || 'background:linear-gradient(to right, #ccc, #999)'}"></div>
                        <div style="font-size:13px; font-weight:bold; margin-bottom:4px;">${grad.name || 'Градиент ' + (index + 1)}</div>
                        <div style="font-size:11px; color:#666; margin-bottom:8px;">${grad.type === 'linear' ? 'Линейный' : 'Радиальный'}</div>
                        <div style="display:flex; gap:5px;">
                            <button class="apply-gradient" style="flex:1; padding:6px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;">Применить</button>
                            <button class="delete-gradient" style="padding:6px 10px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;">×</button>
                        </div>
                    </div>
                `).join('');
            
            // Добавляем обработчики
            library.querySelectorAll('.apply-gradient').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('.gradient-item').getAttribute('data-index'));
                    this.applyGradientFromLibrary(index);
                });
            });
            
            library.querySelectorAll('.delete-gradient').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('.gradient-item').getAttribute('data-index'));
                    if (confirm('Удалить этот градиент из библиотеки?')) {
                        this.gradients.splice(index, 1);
                        this.updateGradientLibrary();
                    }
                });
            });
        }
    },
    
    // Применить градиент из библиотеки
    applyGradientFromLibrary: function(index) {
        if (!window.selectedElement || !this.gradients[index]) return;
        
        const gradient = this.gradients[index];
        
        // Если у градиента есть ID, используем его
        if (gradient.id) {
            window.selectedElement.setAttribute('fill', `url(#${gradient.id})`);
        } else {
            // Иначе создаем новый градиент
            const gradientId = this.createSVGGradient(gradient.stops, gradient.type === 'radial');
            if (gradientId) {
                window.selectedElement.setAttribute('fill', `url(#${gradientId})`);
            }
        }
        
        commitHistory();
        alert('Градиент применен');
    },
    
    // Загрузить градиенты из SVG
    loadGradientsFromSVG: function() {
        const svg = document.getElementById('svgCanvas');
        if (!svg) return;
        
        const defs = svg.querySelector('defs');
        if (!defs) return;
        
        // Загружаем линейные градиенты
        defs.querySelectorAll('linearGradient').forEach((grad, index) => {
            const stops = Array.from(grad.querySelectorAll('stop')).map(stop => ({
                color: stop.getAttribute('stop-color') || '#000000',
                offset: stop.getAttribute('offset') || '0%',
                opacity: parseFloat(stop.getAttribute('stop-opacity') || 1)
            }));
            
            if (stops.length >= 2) {
                this.gradients.push({
                    id: grad.id,
                    type: 'linear',
                    stops: stops,
                    name: grad.id || `Линейный градиент ${index + 1}`
                });
            }
        });
        
        // Загружаем радиальные градиенты
        defs.querySelectorAll('radialGradient').forEach((grad, index) => {
            const stops = Array.from(grad.querySelectorAll('stop')).map(stop => ({
                color: stop.getAttribute('stop-color') || '#000000',
                offset: stop.getAttribute('offset') || '0%',
                opacity: parseFloat(stop.getAttribute('stop-opacity') || 1)
            }));
            
            if (stops.length >= 2) {
                this.gradients.push({
                    id: grad.id,
                    type: 'radial',
                    stops: stops,
                    name: grad.id || `Радиальный градиент ${index + 1}`
                });
            }
        });
    },
    
    // Инициализировать стандартные градиенты
    initDefaultGradients: function() {
        if (this.gradients.length === 0) {
            this.gradients = [
                {
                    type: 'linear',
                    stops: [
                        { color: '#ff0000', offset: '0%', opacity: 1 },
                        { color: '#0000ff', offset: '100%', opacity: 1 }
                    ],
                    name: 'Красно-синий',
                    preview: 'linear-gradient(to right, #ff0000, #0000ff)'
                },
                {
                    type: 'linear',
                    stops: [
                        { color: '#00ff00', offset: '0%', opacity: 1 },
                        { color: '#008800', offset: '100%', opacity: 1 }
                    ],
                    name: 'Зеленый градиент',
                    preview: 'linear-gradient(to right, #00ff00, #008800)'
                },
                {
                    type: 'radial',
                    stops: [
                        { color: '#ffff00', offset: '0%', opacity: 1 },
                        { color: '#ff9900', offset: '100%', opacity: 1 }
                    ],
                    name: 'Желто-оранжевый радиальный',
                    preview: 'radial-gradient(circle at center, #ffff00, #ff9900)'
                }
            ];
        }
    }
};

// Обновляем функцию showRightTab для поддержки вкладки градиентов
document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем систему градиентов
    window.gradientSystem.init();
    
    // Добавляем обработчик для вкладки градиентов
    const gradientTab = document.getElementById('tab-gradient');
    if (gradientTab) {
        gradientTab.addEventListener('click', (e) => {
            e.preventDefault();
            window.showRightTab('gradient');
        });
    }
    
    // Обновляем функцию showRightTab
    const originalShowRightTab = window.showRightTab;
    window.showRightTab = function(name) {
        originalShowRightTab.apply(this, arguments);
        
        const layers = document.getElementById('layersPanel');
        const inspector = document.getElementById('inspectorPanel');
        const animationPanel = document.getElementById('animationPanel');
        const gradientPanel = document.getElementById('gradientPanel');
        
        if (!gradientPanel) return;
        
        if (name === 'gradient') {
            if (layers) layers.style.display = 'none';
            if (inspector) inspector.style.display = 'none';
            if (animationPanel) animationPanel.style.display = 'none';
            gradientPanel.style.display = 'block';
            
            // Обновить классы вкладок
            document.querySelectorAll('.right-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            const gradientTab = document.getElementById('tab-gradient');
            if (gradientTab) gradientTab.classList.add('active');
            
            // Обновить контент градиентов
            window.gradientSystem.updateGradientContent();
        } else if (name === 'animation' || name === 'inspector' || name === 'layers') {
            if (gradientPanel) gradientPanel.style.display = 'none';
        }
    };
    
    // Добавляем CSS стили для градиентов
    const style = document.createElement('style');
    style.textContent = `
        .gradient-tab {
            transition: all 0.2s ease;
        }
        
        .gradient-tab:hover {
            opacity: 0.9;
        }
        
        .gradient-preview, .pattern-preview {
            transition: all 0.3s ease;
        }
        
        .gradient-item {
            transition: all 0.2s ease;
        }
        
        .gradient-item:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transform: translateY(-2px);
        }
        
        .preset-gradient {
            transition: all 0.2s ease;
        }
        
        .preset-gradient:hover {
            transform: scale(1.05);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        input[type="range"] {
            -webkit-appearance: none;
            height: 6px;
            border-radius: 3px;
            background: #e0e0e0;
            outline: none;
        }
        
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4a6fa5;
            cursor: pointer;
        }
        
        input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4a6fa5;
            cursor: pointer;
            border: none;
        }
    `;
    document.head.appendChild(style);
});

// Добавляем экспортируемую функцию для отображения вкладки градиентов
window.showGradientPanel = function() {
    window.showRightTab('gradient');
};


// ФИЛЬТРЫ

// --- Фильтры и Эффекты ---
window.filterSystem = {
    filters: [],
    currentFilters: {},
    filterPresets: {},
    
    // Инициализация системы фильтров
    init: function() {
        // Инициализируем пресеты фильтров
        this.initFilterPresets();
        
        // Загружаем фильтры из SVG
        this.loadFiltersFromSVG();
        
        console.log('Filter system initialized');
    },
    
    // Инициализация пресетов фильтров
    initFilterPresets: function() {
        this.filterPresets = {
            // Основные фильтры
            blur: {
                name: "Размытие",
                type: "blur",
                params: { stdDeviation: 5 },
                description: "Размытие по Гауссу"
            },
            dropShadow: {
                name: "Тень",
                type: "dropShadow",
                params: { dx: 2, dy: 2, blur: 5, color: "#000000", opacity: 0.5 },
                description: "Внешняя тень"
            },
            innerGlow: {
                name: "Внутреннее свечение",
                type: "innerGlow",
                params: { dx: 0, dy: 0, blur: 10, color: "#ffffff", opacity: 0.7 },
                description: "Свечение внутри объекта"
            },
            outerGlow: {
                name: "Внешнее свечение",
                type: "outerGlow",
                params: { dx: 0, dy: 0, blur: 15, color: "#00ff00", opacity: 0.8 },
                description: "Свечение вокруг объекта"
            },
            emboss: {
                name: "Рельеф",
                type: "emboss",
                params: { elevation: 5 },
                description: "Эффект объема и рельефа"
            },
            invert: {
                name: "Инверсия",
                type: "invert",
                params: { amount: 1 },
                description: "Инверсия цветов"
            },
            neon: {
                name: "Неон",
                type: "neon",
                params: { color: "#00ffff", blur: 10, intensity: 2 },
                description: "Неоновое свечение"
            },
            chrome: {
                name: "Хром",
                type: "chrome",
                params: { intensity: 1 },
                description: "Хромированная поверхность"
            },
            smoke: {
                name: "Дым",
                type: "smoke",
                params: { opacity: 0.3, turbulence: 0.5 },
                description: "Дымчатый эффект"
            },
            sepia: {
                name: "Сепия",
                type: "sepia",
                params: { amount: 1 },
                description: "Старинная фотография"
            },
            grayscale: {
                name: "Черно-белый",
                type: "grayscale",
                params: { amount: 1 },
                description: "Оттенки серого"
            },
            hueRotate: {
                name: "Сдвиг цвета",
                type: "hueRotate",
                params: { angle: 90 },
                description: "Изменение цветового тона"
            },
            saturate: {
                name: "Насыщенность",
                type: "saturate",
                params: { amount: 2 },
                description: "Увеличение насыщенности цветов"
            },
            contrast: {
                name: "Контраст",
                type: "contrast",
                params: { amount: 1.5 },
                description: "Увеличение контраста"
            },
            brightness: {
                name: "Яркость",
                type: "brightness",
                params: { amount: 1.2 },
                description: "Изменение яркости"
            }
        };
    },
    
    // Загрузить фильтры из SVG
    loadFiltersFromSVG: function() {
        const svg = document.getElementById('svgCanvas');
        if (!svg) return;
        
        const defs = svg.querySelector('defs');
        if (!defs) return;
        
        // Загружаем существующие фильтры
        defs.querySelectorAll('filter').forEach((filter, index) => {
            this.filters.push({
                id: filter.id,
                name: filter.id || `Фильтр ${index + 1}`,
                elements: Array.from(filter.children).map(child => ({
                    tag: child.tagName,
                    attributes: Array.from(child.attributes).reduce((acc, attr) => {
                        acc[attr.name] = attr.value;
                        return acc;
                    }, {})
                }))
            });
        });
    },
    
    // Получить UI фильтров
    getFilterUI: function() {
        return `
            <h4 style="margin-top:0;">Фильтры и эффекты</h4>
            
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px; font-size:14px;">Выберите фильтр:</label>
                <select id="filter-type" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                    <option value="">-- Выберите фильтр --</option>
                    ${Object.entries(this.filterPresets).map(([key, preset]) => 
                        `<option value="${key}">${preset.name} - ${preset.description}</option>`
                    ).join('')}
                </select>
            </div>
            
            <div id="filter-params-container" style="display:none; margin-bottom:15px; padding:15px; background:#f8f9fa; border-radius:4px;">
                <h5 style="margin-top:0; margin-bottom:10px;">Параметры фильтра</h5>
                <div id="filter-params"></div>
            </div>
            
            <div id="filter-preview" style="width:100%; height:80px; border:1px solid #ddd; margin-bottom:15px; border-radius:4px; background:linear-gradient(45deg, #4a6fa5, #6a8fc5); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">
                Предпросмотр
            </div>
            
            <div style="display:flex; gap:8px; margin-bottom:15px;">
                <button id="add-filter" style="flex:1; padding:8px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">Добавить фильтр</button>
                <button id="preview-filter" style="flex:1; padding:8px; background:#17a2b8; color:white; border:none; border-radius:4px; cursor:pointer;">Предпросмотр</button>
            </div>
            
            <div style="margin-bottom:15px;">
                <h5 style="margin-bottom:8px;">Цепочка фильтров:</h5>
                <div id="filter-chain" style="max-height:200px; overflow-y:auto; border:1px solid #ddd; border-radius:4px; padding:10px; background:white;">
                    <div style="color:#666; text-align:center; padding:20px;">Фильтры не добавлены</div>
                </div>
            </div>
            
            <div style="display:flex; gap:8px; margin-bottom:15px;">
                <button id="apply-filter" style="flex:1; padding:8px; background:#4a6fa5; color:white; border:none; border-radius:4px; cursor:pointer;">Применить к выделенному</button>
                <button id="clear-filters" style="flex:1; padding:8px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer;">Очистить цепочку</button>
            </div>
            
            <div style="border-top:1px solid #ddd; padding-top:15px;">
                <h5 style="margin-top:0; margin-bottom:8px;">Готовые эффекты:</h5>
                <div id="filter-presets" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;">
                    ${this.getFilterPresetButtons()}
                </div>
            </div>
        `;
    },
    
    // Получить кнопки пресетов фильтров
    getFilterPresetButtons: function() {
        const presets = [
            { id: 'neon-effect', name: 'Неоновый', filters: ['neon', 'dropShadow'] },
            { id: 'chrome-effect', name: 'Хромированный', filters: ['chrome', 'emboss'] },
            { id: 'vintage-effect', name: 'Винтаж', filters: ['sepia', 'blur'] },
            { id: 'glowing-effect', name: 'Светящийся', filters: ['outerGlow', 'innerGlow'] },
            { id: 'smoky-effect', name: 'Дымчатый', filters: ['smoke', 'blur'] },
            { id: 'bw-effect', name: 'Черно-белый', filters: ['grayscale'] },
            { id: 'inverted-effect', name: 'Инвертированный', filters: ['invert', 'contrast'] },
            { id: 'colorful-effect', name: 'Цветной', filters: ['hueRotate', 'saturate'] }
        ];
        
        return presets.map(preset => `
            <button class="filter-preset" data-preset='${JSON.stringify(preset.filters)}' 
                    style="padding:8px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">
                ${preset.name}
            </button>
        `).join('');
    },
    
    // Получить параметры для выбранного фильтра
    getFilterParamsUI: function(filterType) {
        const preset = this.filterPresets[filterType];
        if (!preset) return '';
        
        let paramsHTML = '';
        
        switch(filterType) {
            case 'blur':
                paramsHTML = `
                    <label style="display:block; margin-bottom:10px;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Интенсивность размытия:</span>
                        <input type="range" id="blur-amount" min="0" max="20" value="${preset.params.stdDeviation}" step="0.5" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0</span>
                            <span id="blur-value">${preset.params.stdDeviation}</span>
                            <span>20</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'dropShadow':
            case 'innerGlow':
            case 'outerGlow':
                paramsHTML = `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                        <label>
                            <span style="display:block; margin-bottom:5px; font-size:13px;">Смещение X:</span>
                            <input type="number" id="${filterType}-dx" value="${preset.params.dx}" step="1" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:3px;">
                        </label>
                        <label>
                            <span style="display:block; margin-bottom:5px; font-size:13px;">Смещение Y:</span>
                            <input type="number" id="${filterType}-dy" value="${preset.params.dy}" step="1" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:3px;">
                        </label>
                    </div>
                    <label style="display:block; margin-bottom:10px;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Размытие:</span>
                        <input type="range" id="${filterType}-blur" min="0" max="50" value="${preset.params.blur}" step="1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0</span>
                            <span id="${filterType}-blur-value">${preset.params.blur}</span>
                            <span>50</span>
                        </div>
                    </label>
                    <label style="display:block; margin-bottom:10px;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Цвет:</span>
                        <input type="color" id="${filterType}-color" value="${preset.params.color}" style="width:100%; height:40px; border:1px solid #ddd; border-radius:3px;">
                    </label>
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Прозрачность:</span>
                        <input type="range" id="${filterType}-opacity" min="0" max="1" value="${preset.params.opacity}" step="0.1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0</span>
                            <span id="${filterType}-opacity-value">${preset.params.opacity}</span>
                            <span>1</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'emboss':
                paramsHTML = `
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Интенсивность рельефа:</span>
                        <input type="range" id="emboss-elevation" min="1" max="20" value="${preset.params.elevation}" step="1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>1</span>
                            <span id="emboss-value">${preset.params.elevation}</span>
                            <span>20</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'invert':
            case 'grayscale':
            case 'sepia':
                paramsHTML = `
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Интенсивность (0-1):</span>
                        <input type="range" id="${filterType}-amount" min="0" max="1" value="${preset.params.amount}" step="0.1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0</span>
                            <span id="${filterType}-value">${preset.params.amount}</span>
                            <span>1</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'neon':
                paramsHTML = `
                    <label style="display:block; margin-bottom:10px;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Цвет неона:</span>
                        <input type="color" id="neon-color" value="${preset.params.color}" style="width:100%; height:40px; border:1px solid #ddd; border-radius:3px;">
                    </label>
                    <label style="display:block; margin-bottom:10px;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Размытие:</span>
                        <input type="range" id="neon-blur" min="1" max="30" value="${preset.params.blur}" step="1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>1</span>
                            <span id="neon-blur-value">${preset.params.blur}</span>
                            <span>30</span>
                        </div>
                    </label>
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Интенсивность:</span>
                        <input type="range" id="neon-intensity" min="1" max="5" value="${preset.params.intensity}" step="0.5" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>1</span>
                            <span id="neon-intensity-value">${preset.params.intensity}</span>
                            <span>5</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'chrome':
                paramsHTML = `
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Интенсивность хрома:</span>
                        <input type="range" id="chrome-intensity" min="0.5" max="3" value="${preset.params.intensity}" step="0.1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0.5</span>
                            <span id="chrome-value">${preset.params.intensity}</span>
                            <span>3</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'smoke':
                paramsHTML = `
                    <label style="display:block; margin-bottom:10px;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Плотность дыма:</span>
                        <input type="range" id="smoke-opacity" min="0.1" max="0.8" value="${preset.params.opacity}" step="0.1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0.1</span>
                            <span id="smoke-opacity-value">${preset.params.opacity}</span>
                            <span>0.8</span>
                        </div>
                    </label>
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Турбулентность:</span>
                        <input type="range" id="smoke-turbulence" min="0.1" max="2" value="${preset.params.turbulence}" step="0.1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0.1</span>
                            <span id="smoke-turbulence-value">${preset.params.turbulence}</span>
                            <span>2</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'hueRotate':
                paramsHTML = `
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Угол поворота цвета (градусы):</span>
                        <input type="range" id="hueRotate-angle" min="0" max="360" value="${preset.params.angle}" step="1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0°</span>
                            <span id="hueRotate-value">${preset.params.angle}°</span>
                            <span>360°</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'saturate':
                paramsHTML = `
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Насыщенность (0-3):</span>
                        <input type="range" id="saturate-amount" min="0" max="3" value="${preset.params.amount}" step="0.1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0</span>
                            <span id="saturate-value">${preset.params.amount}</span>
                            <span>3</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'contrast':
                paramsHTML = `
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Контраст (0.5-2):</span>
                        <input type="range" id="contrast-amount" min="0.5" max="2" value="${preset.params.amount}" step="0.1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0.5</span>
                            <span id="contrast-value">${preset.params.amount}</span>
                            <span>2</span>
                        </div>
                    </label>
                `;
                break;
                
            case 'brightness':
                paramsHTML = `
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:5px; font-size:13px;">Яркость (0.5-2):</span>
                        <input type="range" id="brightness-amount" min="0.5" max="2" value="${preset.params.amount}" step="0.1" style="width:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                            <span>0.5</span>
                            <span id="brightness-value">${preset.params.amount}</span>
                            <span>2</span>
                        </div>
                    </label>
                `;
                break;
        }
        
        return paramsHTML;
    },
    
    // Инициализация UI фильтров
    initFilterUI: function() {
        // Обработчик выбора типа фильтра
        const filterTypeSelect = document.getElementById('filter-type');
        if (filterTypeSelect) {
            filterTypeSelect.addEventListener('change', (e) => {
                const filterType = e.target.value;
                const paramsContainer = document.getElementById('filter-params-container');
                const paramsDiv = document.getElementById('filter-params');
                
                if (filterType) {
                    paramsContainer.style.display = 'block';
                    paramsDiv.innerHTML = this.getFilterParamsUI(filterType);
                    this.initFilterParamEvents(filterType);
                } else {
                    paramsContainer.style.display = 'none';
                }
            });
        }
        
        // Обработчик добавления фильтра
        const addFilterBtn = document.getElementById('add-filter');
        if (addFilterBtn) {
            addFilterBtn.addEventListener('click', () => {
                this.addFilterToChain();
            });
        }
        
        // Обработчик предпросмотра
        const previewBtn = document.getElementById('preview-filter');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                this.previewFilter();
            });
        }
        
        // Обработчик применения фильтра
        const applyBtn = document.getElementById('apply-filter');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyFilterToSelected();
            });
        }
        
        // Обработчик очистки фильтров
        const clearBtn = document.getElementById('clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearFilterChain();
            });
        }
        
        // Обработчики пресетов
        document.querySelectorAll('.filter-preset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filters = JSON.parse(e.target.getAttribute('data-preset'));
                this.applyFilterPreset(filters);
            });
        });
    },
    
    // Инициализация событий параметров фильтра
    initFilterParamEvents: function(filterType) {
        // Динамическое обновление значений слайдеров
        const sliders = document.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => {
            // Обновляем значение рядом со слайдером
            const updateValue = () => {
                const valueSpan = document.getElementById(slider.id + '-value');
                if (valueSpan) {
                    valueSpan.textContent = slider.value + (slider.id.includes('angle') ? '°' : '');
                }
            };
            
            slider.addEventListener('input', updateValue);
            updateValue(); // Инициализируем начальное значение
        });
    },
    
    // Получить параметры выбранного фильтра
    getFilterParams: function(filterType) {
        const params = {};
        
        switch(filterType) {
            case 'blur':
                params.stdDeviation = parseFloat(document.getElementById('blur-amount').value);
                break;
                
            case 'dropShadow':
            case 'innerGlow':
            case 'outerGlow':
                params.dx = parseFloat(document.getElementById(filterType + '-dx').value);
                params.dy = parseFloat(document.getElementById(filterType + '-dy').value);
                params.blur = parseFloat(document.getElementById(filterType + '-blur').value);
                params.color = document.getElementById(filterType + '-color').value;
                params.opacity = parseFloat(document.getElementById(filterType + '-opacity').value);
                break;
                
            case 'emboss':
                params.elevation = parseFloat(document.getElementById('emboss-elevation').value);
                break;
                
            case 'invert':
            case 'grayscale':
            case 'sepia':
                params.amount = parseFloat(document.getElementById(filterType + '-amount').value);
                break;
                
            case 'neon':
                params.color = document.getElementById('neon-color').value;
                params.blur = parseFloat(document.getElementById('neon-blur').value);
                params.intensity = parseFloat(document.getElementById('neon-intensity').value);
                break;
                
            case 'chrome':
                params.intensity = parseFloat(document.getElementById('chrome-intensity').value);
                break;
                
            case 'smoke':
                params.opacity = parseFloat(document.getElementById('smoke-opacity').value);
                params.turbulence = parseFloat(document.getElementById('smoke-turbulence').value);
                break;
                
            case 'hueRotate':
                params.angle = parseFloat(document.getElementById('hueRotate-angle').value);
                break;
                
            case 'saturate':
                params.amount = parseFloat(document.getElementById('saturate-amount').value);
                break;
                
            case 'contrast':
                params.amount = parseFloat(document.getElementById('contrast-amount').value);
                break;
                
            case 'brightness':
                params.amount = parseFloat(document.getElementById('brightness-amount').value);
                break;
        }
        
        return params;
    },
    
    // Добавить фильтр в цепочку
    addFilterToChain: function() {
        const filterType = document.getElementById('filter-type').value;
        if (!filterType) {
            alert('Выберите тип фильтра');
            return;
        }
        
        const preset = this.filterPresets[filterType];
        const params = this.getFilterParams(filterType);
        
        // Генерируем уникальный ID для фильтра
        const filterId = 'filter_' + Math.random().toString(36).substr(2, 9);
        
        // Добавляем фильтр в цепочку
        if (!this.currentFilters[filterId]) {
            this.currentFilters[filterId] = {
                id: filterId,
                type: filterType,
                name: preset.name,
                params: params,
                enabled: true
            };
            
            this.updateFilterChainDisplay();
        }
    },
    
    // Обновить отображение цепочки фильтров
    updateFilterChainDisplay: function() {
        const chainDiv = document.getElementById('filter-chain');
        if (!chainDiv) return;
        
        const filters = Object.values(this.currentFilters);
        
        if (filters.length === 0) {
            chainDiv.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">Фильтры не добавлены</div>';
            return;
        }
        
        let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
        
        filters.forEach((filter, index) => {
            html += `
                <div class="filter-item" data-id="${filter.id}" 
                     style="display:flex; align-items:center; gap:10px; padding:10px; background:#f8f9fa; border-radius:4px;">
                    <input type="checkbox" class="filter-enabled" ${filter.enabled ? 'checked' : ''} style="margin:0;">
                    <div style="flex:1;">
                        <div style="font-weight:bold; font-size:13px;">${filter.name}</div>
                        <div style="font-size:11px; color:#666;">${this.getFilterDescription(filter)}</div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="move-filter-up" style="padding:4px 8px; background:#6c757d; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button class="move-filter-down" style="padding:4px 8px; background:#6c757d; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;" ${index === filters.length - 1 ? 'disabled' : ''}>↓</button>
                        <button class="remove-filter" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;">×</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        chainDiv.innerHTML = html;
        
        // Добавляем обработчики для элементов цепочки
        this.initFilterChainEvents();
    },
    
    // Получить описание фильтра
    getFilterDescription: function(filter) {
        const params = filter.params;
        
        switch(filter.type) {
            case 'blur':
                return `Размытие: ${params.stdDeviation}`;
            case 'dropShadow':
                return `Тень: ${params.dx}px ${params.dy}px ${params.blur}px`;
            case 'innerGlow':
                return `Внутр. свечение: ${params.blur}px`;
            case 'outerGlow':
                return `Внеш. свечение: ${params.blur}px`;
            case 'emboss':
                return `Рельеф: ${params.elevation}`;
            case 'invert':
                return `Инверсия: ${params.amount}`;
            case 'neon':
                return `Неон: ${params.blur}px`;
            case 'chrome':
                return `Хром: ${params.intensity}`;
            case 'smoke':
                return `Дым: ${params.opacity}`;
            default:
                return filter.type;
        }
    },
    
    // Инициализация событий цепочки фильтров
    initFilterChainEvents: function() {
        // Включение/выключение фильтров
        document.querySelectorAll('.filter-enabled').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const filterId = e.target.closest('.filter-item').getAttribute('data-id');
                if (this.currentFilters[filterId]) {
                    this.currentFilters[filterId].enabled = e.target.checked;
                }
            });
        });
        
        // Удаление фильтров
        document.querySelectorAll('.remove-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filterId = e.target.closest('.filter-item').getAttribute('data-id');
                delete this.currentFilters[filterId];
                this.updateFilterChainDisplay();
            });
        });
        
        // Перемещение фильтров вверх
        document.querySelectorAll('.move-filter-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filterId = e.target.closest('.filter-item').getAttribute('data-id');
                this.moveFilterUp(filterId);
            });
        });
        
        // Перемещение фильтров вниз
        document.querySelectorAll('.move-filter-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filterId = e.target.closest('.filter-item').getAttribute('data-id');
                this.moveFilterDown(filterId);
            });
        });
    },
    
    // Переместить фильтр вверх
    moveFilterUp: function(filterId) {
        const filters = Object.entries(this.currentFilters);
        const index = filters.findIndex(([id]) => id === filterId);
        
        if (index > 0) {
            // Меняем местами с предыдущим фильтром
            const temp = filters[index];
            filters[index] = filters[index - 1];
            filters[index - 1] = temp;
            
            // Обновляем текущие фильтры
            this.currentFilters = Object.fromEntries(filters);
            this.updateFilterChainDisplay();
        }
    },
    
    // Переместить фильтр вниз
    moveFilterDown: function(filterId) {
        const filters = Object.entries(this.currentFilters);
        const index = filters.findIndex(([id]) => id === filterId);
        
        if (index < filters.length - 1) {
            // Меняем местами со следующим фильтром
            const temp = filters[index];
            filters[index] = filters[index + 1];
            filters[index + 1] = temp;
            
            // Обновляем текущие фильтры
            this.currentFilters = Object.fromEntries(filters);
            this.updateFilterChainDisplay();
        }
    },
    
    // Предпросмотр фильтра
    previewFilter: function() {
        const previewDiv = document.getElementById('filter-preview');
        if (!previewDiv) return;
        
        const filterString = this.generateFilterString();
        if (filterString) {
            previewDiv.style.filter = filterString;
        }
    },
    
    // Сгенерировать строку фильтра
    generateFilterString: function() {
        const enabledFilters = Object.values(this.currentFilters).filter(f => f.enabled);
        
        if (enabledFilters.length === 0) {
            return '';
        }
        
        const filterParts = enabledFilters.map(filter => {
            return this.generateFilterPart(filter);
        });
        
        return filterParts.join(' ');
    },
    
    // Сгенерировать часть фильтра
    generateFilterPart: function(filter) {
        const params = filter.params;
        
        switch(filter.type) {
            case 'blur':
                return `blur(${params.stdDeviation}px)`;
            case 'dropShadow':
                return `drop-shadow(${params.dx}px ${params.dy}px ${params.blur}px ${params.color})`;
            case 'innerGlow':
                // Внутреннее свечение эмулируется через несколько фильтров
                return `drop-shadow(0 0 ${params.blur}px ${params.color})`;
            case 'outerGlow':
                return `drop-shadow(0 0 ${params.blur}px ${params.color})`;
            case 'invert':
                return `invert(${params.amount})`;
            case 'grayscale':
                return `grayscale(${params.amount})`;
            case 'sepia':
                return `sepia(${params.amount})`;
            case 'hueRotate':
                return `hue-rotate(${params.angle}deg)`;
            case 'saturate':
                return `saturate(${params.amount})`;
            case 'contrast':
                return `contrast(${params.amount})`;
            case 'brightness':
                return `brightness(${params.amount})`;
            default:
                return '';
        }
    },
    
    // Применить фильтр к выбранному элементу
    applyFilterToSelected: function() {
        if (!window.selectedElement) {
            alert('Выберите элемент для применения фильтра');
            return;
        }
        
        const filterString = this.generateFilterString();
        if (!filterString) {
            alert('Добавьте хотя бы один фильтр в цепочку');
            return;
        }
        
        // Создаем SVG фильтр
        const filterId = this.createSVGFilter();
        
        if (filterId) {
            window.selectedElement.setAttribute('filter', `url(#${filterId})`);
            commitHistory();
            alert('Фильтр применен к выбранному элементу');
        }
    },
    
    // Создать SVG фильтр
    createSVGFilter: function() {
        const svg = document.getElementById('svgCanvas');
        if (!svg) return '';
        
        // Получаем или создаем defs
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        
        // Создаем фильтр
        const filterId = 'filter_' + Math.random().toString(36).substr(2, 9);
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', filterId);
        filter.setAttribute('filterUnits', 'userSpaceOnUse');
        
        // Получаем включенные фильтры
        const enabledFilters = Object.values(this.currentFilters).filter(f => f.enabled);
        
        // Добавляем примитивы фильтров в правильном порядке
        enabledFilters.forEach((filterObj, index) => {
            this.addFilterPrimitives(filter, filterObj, index);
        });
        
        // Добавляем фильтр в defs
        defs.appendChild(filter);
        
        return filterId;
    },
    
    // Добавить примитивы фильтра
    addFilterPrimitives: function(filterElement, filterObj, index) {
        const ns = 'http://www.w3.org/2000/svg';
        const params = filterObj.params;
        
        switch(filterObj.type) {
            case 'blur':
                const feGaussianBlur = document.createElementNS(ns, 'feGaussianBlur');
                feGaussianBlur.setAttribute('in', 'SourceGraphic');
                feGaussianBlur.setAttribute('stdDeviation', params.stdDeviation);
                feGaussianBlur.setAttribute('result', `blur${index}`);
                filterElement.appendChild(feGaussianBlur);
                break;
                
            case 'dropShadow':
                const feDropShadow = document.createElementNS(ns, 'feDropShadow');
                feDropShadow.setAttribute('dx', params.dx);
                feDropShadow.setAttribute('dy', params.dy);
                feDropShadow.setAttribute('stdDeviation', params.blur / 2);
                feDropShadow.setAttribute('flood-color', params.color);
                feDropShadow.setAttribute('flood-opacity', params.opacity);
                feDropShadow.setAttribute('result', `shadow${index}`);
                filterElement.appendChild(feDropShadow);
                break;
                
            case 'innerGlow':
                // Внутреннее свечение - сложный эффект
                const feFlood = document.createElementNS(ns, 'feFlood');
                feFlood.setAttribute('flood-color', params.color);
                feFlood.setAttribute('flood-opacity', params.opacity);
                feFlood.setAttribute('result', `flood${index}`);
                filterElement.appendChild(feFlood);
                
                const feComposite1 = document.createElementNS(ns, 'feComposite');
                feComposite1.setAttribute('in', 'flood' + index);
                feComposite1.setAttribute('in2', 'SourceAlpha');
                feComposite1.setAttribute('operator', 'in');
                feComposite1.setAttribute('result', `composite${index}a`);
                filterElement.appendChild(feComposite1);
                
                const feGaussianBlur2 = document.createElementNS(ns, 'feGaussianBlur');
                feGaussianBlur2.setAttribute('in', `composite${index}a`);
                feGaussianBlur2.setAttribute('stdDeviation', params.blur / 2);
                feGaussianBlur2.setAttribute('result', `blur${index}a`);
                filterElement.appendChild(feGaussianBlur2);
                
                const feComposite2 = document.createElementNS(ns, 'feComposite');
                feComposite2.setAttribute('in', 'SourceGraphic');
                feComposite2.setAttribute('in2', `blur${index}a`);
                feComposite2.setAttribute('operator', 'over');
                feComposite2.setAttribute('result', `innerGlow${index}`);
                filterElement.appendChild(feComposite2);
                break;
                
            case 'outerGlow':
                const feFlood2 = document.createElementNS(ns, 'feFlood');
                feFlood2.setAttribute('flood-color', params.color);
                feFlood2.setAttribute('flood-opacity', params.opacity);
                feFlood2.setAttribute('result', `flood${index}b`);
                filterElement.appendChild(feFlood2);
                
                const feComposite3 = document.createElementNS(ns, 'feComposite');
                feComposite3.setAttribute('in', 'flood' + index + 'b');
                feComposite3.setAttribute('in2', 'SourceAlpha');
                feComposite3.setAttribute('operator', 'out');
                feComposite3.setAttribute('result', `composite${index}b`);
                filterElement.appendChild(feComposite3);
                
                const feGaussianBlur3 = document.createElementNS(ns, 'feGaussianBlur');
                feGaussianBlur3.setAttribute('in', `composite${index}b`);
                feGaussianBlur3.setAttribute('stdDeviation', params.blur / 2);
                feGaussianBlur3.setAttribute('result', `blur${index}b`);
                filterElement.appendChild(feGaussianBlur3);
                
                const feMerge = document.createElementNS(ns, 'feMerge');
                const feMergeNode1 = document.createElementNS(ns, 'feMergeNode');
                feMergeNode1.setAttribute('in', `blur${index}b`);
                const feMergeNode2 = document.createElementNS(ns, 'feMergeNode');
                feMergeNode2.setAttribute('in', 'SourceGraphic');
                feMerge.appendChild(feMergeNode1);
                feMerge.appendChild(feMergeNode2);
                feMerge.setAttribute('result', `outerGlow${index}`);
                filterElement.appendChild(feMerge);
                break;
                
            case 'emboss':
                const feSpecularLighting = document.createElementNS(ns, 'feSpecularLighting');
                feSpecularLighting.setAttribute('surfaceScale', params.elevation);
                feSpecularLighting.setAttribute('specularConstant', '1');
                feSpecularLighting.setAttribute('specularExponent', '20');
                feSpecularLighting.setAttribute('lighting-color', '#ffffff');
                feSpecularLighting.setAttribute('result', `specular${index}`);
                
                const fePointLight = document.createElementNS(ns, 'fePointLight');
                fePointLight.setAttribute('x', '100');
                fePointLight.setAttribute('y', '100');
                fePointLight.setAttribute('z', '50');
                feSpecularLighting.appendChild(fePointLight);
                filterElement.appendChild(feSpecularLighting);
                break;
                
            case 'invert':
                const feColorMatrix1 = document.createElementNS(ns, 'feColorMatrix');
                feColorMatrix1.setAttribute('type', 'matrix');
                feColorMatrix1.setAttribute('values', '-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0');
                feColorMatrix1.setAttribute('result', `invert${index}`);
                filterElement.appendChild(feColorMatrix1);
                break;
                
            case 'grayscale':
                const feColorMatrix2 = document.createElementNS(ns, 'feColorMatrix');
                feColorMatrix2.setAttribute('type', 'saturate');
                feColorMatrix2.setAttribute('values', 1 - params.amount);
                feColorMatrix2.setAttribute('result', `grayscale${index}`);
                filterElement.appendChild(feColorMatrix2);
                break;
                
            case 'sepia':
                const feColorMatrix3 = document.createElementNS(ns, 'feColorMatrix');
                feColorMatrix3.setAttribute('type', 'matrix');
                feColorMatrix3.setAttribute('values', `
                    0.393 0.769 0.189 0 0
                    0.349 0.686 0.168 0 0
                    0.272 0.534 0.131 0 0
                    0 0 0 1 0
                `.replace(/\s+/g, ' ').trim());
                feColorMatrix3.setAttribute('result', `sepia${index}`);
                filterElement.appendChild(feColorMatrix3);
                break;
                
            case 'hueRotate':
                const feColorMatrix4 = document.createElementNS(ns, 'feColorMatrix');
                feColorMatrix4.setAttribute('type', 'hueRotate');
                feColorMatrix4.setAttribute('values', params.angle);
                feColorMatrix4.setAttribute('result', `hueRotate${index}`);
                filterElement.appendChild(feColorMatrix4);
                break;
                
            case 'saturate':
                const feColorMatrix5 = document.createElementNS(ns, 'feColorMatrix');
                feColorMatrix5.setAttribute('type', 'saturate');
                feColorMatrix5.setAttribute('values', params.amount);
                feColorMatrix5.setAttribute('result', `saturate${index}`);
                filterElement.appendChild(feColorMatrix5);
                break;
                
            case 'contrast':
                const amount = params.amount;
                const intercept = 0.5 * (1 - amount);
                const feColorMatrix6 = document.createElementNS(ns, 'feColorMatrix');
                feColorMatrix6.setAttribute('type', 'matrix');
                feColorMatrix6.setAttribute('values', `
                    ${amount} 0 0 0 ${intercept}
                    0 ${amount} 0 0 ${intercept}
                    0 0 ${amount} 0 ${intercept}
                    0 0 0 1 0
                `.replace(/\s+/g, ' ').trim());
                feColorMatrix6.setAttribute('result', `contrast${index}`);
                filterElement.appendChild(feColorMatrix6);
                break;
                
            case 'brightness':
                const feComponentTransfer = document.createElementNS(ns, 'feComponentTransfer');
                const feFuncR = document.createElementNS(ns, 'feFuncR');
                const feFuncG = document.createElementNS(ns, 'feFuncG');
                const feFuncB = document.createElementNS(ns, 'feFuncB');
                
                feFuncR.setAttribute('type', 'linear');
                feFuncR.setAttribute('slope', params.amount);
                feFuncG.setAttribute('type', 'linear');
                feFuncG.setAttribute('slope', params.amount);
                feFuncB.setAttribute('type', 'linear');
                feFuncB.setAttribute('slope', params.amount);
                
                feComponentTransfer.appendChild(feFuncR);
                feComponentTransfer.appendChild(feFuncG);
                feComponentTransfer.appendChild(feFuncB);
                feComponentTransfer.setAttribute('result', `brightness${index}`);
                filterElement.appendChild(feComponentTransfer);
                break;
        }
    },
    
    // Очистить цепочку фильтров
    clearFilterChain: function() {
        this.currentFilters = {};
        this.updateFilterChainDisplay();
        
        // Сбрасываем предпросмотр
        const previewDiv = document.getElementById('filter-preview');
        if (previewDiv) {
            previewDiv.style.filter = '';
        }
    },
    
    // Применить пресет фильтров
    applyFilterPreset: function(filterTypes) {
        this.clearFilterChain();
        
        filterTypes.forEach(filterType => {
            const preset = this.filterPresets[filterType];
            if (preset) {
                const filterId = 'filter_' + Math.random().toString(36).substr(2, 9);
                this.currentFilters[filterId] = {
                    id: filterId,
                    type: filterType,
                    name: preset.name,
                    params: { ...preset.params },
                    enabled: true
                };
            }
        });
        
        this.updateFilterChainDisplay();
        this.previewFilter();
    }
};

// Добавляем HTML для панели фильтров
document.addEventListener('DOMContentLoaded', () => {
    // Добавляем вкладку для фильтров
    const tabsContainer = document.querySelector('.toolbar-settings-container > div:first-child');
    if (tabsContainer) {
        const filterTab = document.createElement('button');
        filterTab.id = 'tab-filter';
        filterTab.className = 'right-tab';
        filterTab.style.padding = '6px 8px';
        filterTab.textContent = 'Фильтры';
        
        // Вставляем после вкладки градиентов
        const gradientTab = document.getElementById('tab-gradient');
        const animationTab = document.getElementById('tab-animation');
        const inspectorTab = document.getElementById('tab-inspector');
        
        if (gradientTab) {
            gradientTab.parentNode.insertBefore(filterTab, gradientTab.nextSibling);
        } else if (animationTab) {
            animationTab.parentNode.insertBefore(filterTab, animationTab.nextSibling);
        } else if (inspectorTab) {
            inspectorTab.parentNode.insertBefore(filterTab, inspectorTab.nextSibling);
        } else {
            tabsContainer.appendChild(filterTab);
        }
    }
    
    // Добавляем панель фильтров
    const settingsContainer = document.querySelector('.toolbar-settings-container');
    if (settingsContainer) {
        const filterPanel = document.createElement('div');
        filterPanel.id = 'filterPanel';
        filterPanel.style.display = 'none';
        filterPanel.style.marginTop = '15px';
        filterPanel.style.border = '1px solid #ddd';
        filterPanel.style.padding = '8px';
        filterPanel.style.width = '100%';
        filterPanel.style.boxSizing = 'border-box';
        filterPanel.innerHTML = `
            <strong>Фильтры и Эффекты</strong><br><br>
            <div id="filter-content">
                <div style="color:#666; margin-top:6px;">Добавление и редактирование фильтров</div>
            </div>
        `;
        
        // Вставляем после панели градиентов
        const gradientPanel = document.getElementById('gradientPanel');
        const animationPanel = document.getElementById('animationPanel');
        const inspectorPanel = document.getElementById('inspectorPanel');
        
        if (gradientPanel) {
            gradientPanel.parentNode.insertBefore(filterPanel, gradientPanel.nextSibling);
        } else if (animationPanel) {
            animationPanel.parentNode.insertBefore(filterPanel, animationPanel.nextSibling);
        } else if (inspectorPanel) {
            inspectorPanel.parentNode.insertBefore(filterPanel, inspectorPanel.nextSibling);
        } else {
            settingsContainer.appendChild(filterPanel);
        }
    }
    
    // Инициализируем систему фильтров
    window.filterSystem.init();
    
    // Добавляем обработчик для вкладки фильтров
    const filterTab = document.getElementById('tab-filter');
    if (filterTab) {
        filterTab.addEventListener('click', (e) => {
            e.preventDefault();
            window.showRightTab('filter');
        });
    }
    
    // Обновляем функцию showRightTab для поддержки вкладки фильтров
    const originalShowRightTab = window.showRightTab;
    window.showRightTab = function(name) {
        originalShowRightTab.apply(this, arguments);
        
        const layers = document.getElementById('layersPanel');
        const inspector = document.getElementById('inspectorPanel');
        const animationPanel = document.getElementById('animationPanel');
        const gradientPanel = document.getElementById('gradientPanel');
        const filterPanel = document.getElementById('filterPanel');
        
        if (!filterPanel) return;
        
        if (name === 'filter') {
            if (layers) layers.style.display = 'none';
            if (inspector) inspector.style.display = 'none';
            if (animationPanel) animationPanel.style.display = 'none';
            if (gradientPanel) gradientPanel.style.display = 'none';
            filterPanel.style.display = 'block';
            
            // Обновить классы вкладок
            document.querySelectorAll('.right-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            const filterTab = document.getElementById('tab-filter');
            if (filterTab) filterTab.classList.add('active');
            
            // Обновить контент фильтров
            this.updateFilterContent();
        } else if (name === 'gradient' || name === 'animation' || name === 'inspector' || name === 'layers') {
            if (filterPanel) filterPanel.style.display = 'none';
        }
    };
    
    // Добавляем метод для обновления контента фильтров
    window.updateFilterContent = function() {
        const content = document.getElementById('filter-content');
        if (!content) return;
        
        content.innerHTML = window.filterSystem.getFilterUI();
        window.filterSystem.initFilterUI();
    };
    
    // Добавляем CSS стили для фильтров
    const style = document.createElement('style');
    style.textContent = `
        .filter-item {
            transition: all 0.2s ease;
        }
        
        .filter-item:hover {
            background: #e9ecef !important;
        }
        
        .filter-preset {
            transition: all 0.2s ease;
        }
        
        .filter-preset:hover {
            background: #5a6268 !important;
            transform: translateY(-1px);
        }
        
        #filter-preview {
            transition: filter 0.3s ease;
        }
        
        input[type="range"] {
            -webkit-appearance: none;
            height: 6px;
            border-radius: 3px;
            background: #e0e0e0;
            outline: none;
            margin: 5px 0;
        }
        
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4a6fa5;
            cursor: pointer;
        }
        
        input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4a6fa5;
            cursor: pointer;
            border: none;
        }
        
        #filter-chain {
            scrollbar-width: thin;
            scrollbar-color: #ccc #f8f9fa;
        }
        
        #filter-chain::-webkit-scrollbar {
            width: 6px;
        }
        
        #filter-chain::-webkit-scrollbar-track {
            background: #f8f9fa;
        }
        
        #filter-chain::-webkit-scrollbar-thumb {
            background-color: #ccc;
            border-radius: 3px;
        }
    `;
    document.head.appendChild(style);
});

// Добавляем экспортируемую функцию для отображения вкладки фильтров
window.showFilterPanel = function() {
    window.showRightTab('filter');
};

})();
