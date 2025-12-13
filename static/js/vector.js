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
            window.addEventListener('mouseup', function(evt){ if(isDragging){ isDragging=false; dragTarget=null; dragStart=null; baseTransform=''; if(typeof window.pushHistory === 'function') try{ window.pushHistory(); }catch(e){} } });
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
            if(name === 'inspector'){
                if(layers) layers.style.display = 'none';
                if(inspector) inspector.style.display = 'block';
                if(tabLayers) tabLayers.classList.remove('active'); if(tabInspector) tabInspector.classList.add('active');
            } else {
                if(layers) layers.style.display = 'block';
                if(inspector) inspector.style.display = 'none';
                if(tabLayers) tabLayers.classList.add('active'); if(tabInspector) tabInspector.classList.remove('active');
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
        window.refreshLayers(); window.selectElementById(g.id);
    };

    window.ungroupSelection = function(){
        const sels = getSelectedElements(); if(sels.length!==1){ alert('Выберите группу для разгруппировки'); return; }
        const g = sels[0]; if(!g || g.tagName.toLowerCase()!=='g') { alert('Выбранный элемент не группа'); return; }
        const parent = g.parentNode; while(g.firstChild) parent.insertBefore(g.firstChild, g);
        parent.removeChild(g);
        window.refreshLayers();
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

    /* ================================
   UNDO / REDO (History stack)
   ================================ */

let svgContainer = document.getElementById('svg-container');
let isApplyingHistory = false;

/* 🔹 Получить текущий SVG */
function getCurrentSVG() {
    const svg = svgContainer.querySelector('svg');
    return svg ? svg.outerHTML : '';
}

/* 🔹 Применить SVG */
function applySVG(svgText) {
    isApplyingHistory = true;
    svgContainer.innerHTML = svgText;
    isApplyingHistory = false;
}

/* 🔹 Зафиксировать состояние (вызывать после любого действия) */
function commitHistory() {
    if (isApplyingHistory || !projectId) return;

    fetch('/api/save_vdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            project_id: projectId,
            svg: getCurrentSVG()
        })
    });
}

/* ================================
   UNDO
   ================================ */
function undo() {
    if (!projectId) return;

    fetch('/api/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) {
            applySVG(data.svg);
        }
    });
}

/* ================================
   REDO
   ================================ */
function redo() {
    if (!projectId) return;

    fetch('/api/redo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) {
            applySVG(data.svg);
        }
    });
}

/* ================================
   HOTKEYS
   ================================ */
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if (
        e.ctrlKey &&
        (e.key === 'y' || (e.shiftKey && e.key === 'Z'))
    ) {
        e.preventDefault();
        redo();
    }
});

/* ================================
   AUTO-HISTORY HOOK
   ================================ */
/*
  ВАЖНО:
  Вызывай commitHistory() после:
  - перемещения объекта
  - масштабирования
  - поворота
  - изменения цвета / stroke
  - удаления / создания
*/

// пример: после drag / transform
document.addEventListener('mouseup', () => {
    commitHistory();
});


})();
