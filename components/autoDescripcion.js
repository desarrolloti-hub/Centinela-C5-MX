// autoDescripcion.js - Componente de autocompletado predictivo
// Versión mejorada con logs de depuración y umbral más bajo

class AutoDescripcion extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.frasesCache = [];
        this.sugerenciaActual = null;
        this.indiceSeleccionado = -1;
        this.debounceTimer = null;
        this.coleccion = 'frasesAutoCompletar';
        this.organizacion = '';
        this.umbral = 0.25;   // BAJADO para que sea más fácil mostrar sugerencias
        this.maxSugerencias = 5;
        this.frasesManager = null;
        this.categoriaId = '';
        this.subcategoriaId = '';
    }

    static get observedAttributes() {
        return ['organizacion', 'umbral', 'max'];
    }

    async connectedCallback() {
        this.organizacion = this.getAttribute('organizacion') || '';
        this.umbral = parseFloat(this.getAttribute('umbral')) || 0.25;
        this.maxSugerencias = parseInt(this.getAttribute('max')) || 5;
        
        await this._initFrasesManager();
        this.render();
        this.iniciarEventos();
        await this.cargarFrasesIniciales();
        this.observarCambiosContexto();
        
        console.log('✅ autoDescripcion inicializado', { org: this.organizacion, umbral: this.umbral });
    }

    async _initFrasesManager() {
        try {
            const module = await import('/clases/frasesAutoCompletar.js');
            this.frasesManager = new module.FrasesAutoCompletarManager();
            console.log('✅ FrasesAutoCompletarManager cargado');
        } catch (error) {
            console.warn('⚠️ No se pudo importar FrasesAutoCompletarManager', error);
            this.frasesManager = null;
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; position: relative; width: 100%; }
                .textarea-wrapper { position: relative; width: 100%; }
                textarea {
                    width: 100%;
                    padding: 14px;
                    border-radius: 20px;
                    border: 1px solid var(--color-border-light, #2d2d44);
                    background: var(--color-bg-secondary, #1e1e2f);
                    color: var(--color-text-primary, #ffffff);
                    font-family: inherit;
                    font-size: 1rem;
                    line-height: 1.5;
                    resize: vertical;
                    transition: 0.2s;
                    position: relative;
                    z-index: 2;
                    background-color: var(--color-bg-secondary, #1e1e2f);
                }
                textarea:focus {
                    outline: none;
                    border-color: var(--color-accent-primary, #00cfff);
                    box-shadow: 0 0 0 2px rgba(0,207,255,0.2);
                }
                .ghost-text {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    padding: 14px;
                    color: rgba(200,200,200,0.5);
                    font-family: inherit;
                    font-size: 1rem;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    pointer-events: none;
                    z-index: 1;
                    overflow: hidden;
                    background: transparent;
                }
                .sugerencias {
                    position: absolute;
                    background: var(--color-bg-secondary, #1a1a2e);
                    border: 1px solid var(--color-accent-primary, #00cfff);
                    border-radius: 16px;
                    max-width: 100%;
                    min-width: 240px;
                    z-index: 10000;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    display: none;
                    max-height: 280px;
                    overflow-y: auto;
                }
                .sugerencias div {
                    padding: 12px 14px;
                    cursor: pointer;
                    border-bottom: 1px solid rgba(0,207,255,0.2);
                    transition: 0.15s;
                    font-size: 0.9rem;
                    color: var(--color-text-secondary, #eeeeee);
                }
                .sugerencias div:last-child { border-bottom: none; }
                .sugerencias div:hover, .sugerencias .selected {
                    background: rgba(0,207,255,0.2);
                }
                .small-pct {
                    font-size: 0.7rem;
                    color: #88aaff;
                    float: right;
                    margin-left: 10px;
                }
            </style>
            <div class="textarea-wrapper">
                <textarea rows="5" placeholder="Describe la incidencia..."></textarea>
                <div class="ghost-text"></div>
            </div>
            <div class="sugerencias"></div>
        `;
        this.textarea = this.shadowRoot.querySelector('textarea');
        this.ghostDiv = this.shadowRoot.querySelector('.ghost-text');
        this.sugerenciasDiv = this.shadowRoot.querySelector('.sugerencias');
    }

    get value() { return this.textarea.value; }
    set value(v) {
        this.textarea.value = v;
        this.actualizarGhostText();
        this.dispatchEvent(new Event('change', { bubbles: true }));
        this.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { texto: v } }));
    }

    iniciarEventos() {
        this.textarea.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.actualizarGhostText();
            this.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { texto: this.textarea.value } }));
            this.debounceTimer = setTimeout(() => this.actualizarSugerenciasMenu(), 200);
        });
        
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && this.sugerenciaActual) {
                e.preventDefault();
                this.completarConFrase(this.sugerenciaActual);
            }
            else if (e.key === 'ArrowDown' && this.sugerenciasDiv.style.display === 'block') {
                e.preventDefault();
                this.navegarMenu(1);
            }
            else if (e.key === 'ArrowUp' && this.sugerenciasDiv.style.display === 'block') {
                e.preventDefault();
                this.navegarMenu(-1);
            }
            else if (e.key === 'Enter' && this.indiceSeleccionado >= 0) {
                e.preventDefault();
                const items = this.sugerenciasDiv.querySelectorAll('div');
                if (items[this.indiceSeleccionado]) this.completarConFrase(items[this.indiceSeleccionado].dataset.frase);
            }
            else if (e.key === 'Escape') {
                this.sugerenciasDiv.style.display = 'none';
            }
        });
        
        this.textarea.addEventListener('blur', () => {
            setTimeout(() => { this.sugerenciasDiv.style.display = 'none'; }, 200);
        });
    }

    observarCambiosContexto() {
        const actualizarContexto = () => {
            const catInput = document.getElementById('categoriaIncidencia');
            const subSelect = document.getElementById('subcategoriaIncidencia');
            this.categoriaId = catInput?.dataset?.selectedId || '';
            this.subcategoriaId = subSelect?.value || '';
            console.log(`📌 Contexto actualizado: cat=${this.categoriaId}, sub=${this.subcategoriaId}`);
            this.cargarFrasesIniciales();
        };
        
        const catInput = document.getElementById('categoriaIncidencia');
        if (catInput) {
            const observer = new MutationObserver(actualizarContexto);
            observer.observe(catInput, { attributes: true });
        }
        const subSelect = document.getElementById('subcategoriaIncidencia');
        if (subSelect) subSelect.addEventListener('change', actualizarContexto);
        
        document.addEventListener('categoriaCambiada', actualizarContexto);
        setTimeout(actualizarContexto, 500);
    }

    async actualizarFrasesPorContexto() {
        if (!this.organizacion) {
            console.warn('⚠️ No hay organización configurada');
            this.frasesCache = [];
            return;
        }
        
        try {
            if (this.frasesManager) {
                const frases = await this.frasesManager.obtenerFrasesSugeridas(
                    this.organizacion, this.categoriaId, this.subcategoriaId, 50
                );
                this.frasesCache = frases.map(f => f.texto);
                console.log(`✅ Frases cargadas desde Manager: ${this.frasesCache.length}`, this.frasesCache);
                return;
            }
            
            // Fallback a Firestore directo
            if (!window.firebase?.firestore) {
                console.warn('⚠️ Firestore no disponible');
                this.frasesCache = [];
                return;
            }
            const db = window.firebase.firestore();
            let query = db.collection(this.coleccion)
                .where('organizacion', '==', this.organizacion)
                .where('activa', '==', true)
                .where('vecesUsada', '>=', 3);
            if (this.categoriaId) query = query.where('categoriaId', '==', this.categoriaId);
            if (this.subcategoriaId) query = query.where('subcategoriaId', '==', this.subcategoriaId);
            query = query.orderBy('vecesUsada', 'desc').limit(50);
            const snap = await query.get();
            const frases = [];
            snap.forEach(doc => { if (doc.data().texto) frases.push(doc.data().texto); });
            this.frasesCache = frases;
            console.log(`✅ Frases cargadas desde Firestore: ${this.frasesCache.length}`, this.frasesCache);
        } catch (error) {
            console.error('❌ Error cargando frases:', error);
            this.frasesCache = [];
        }
    }

    // Cálculo de similitud MÁS PERMISIVO
    _calcularPuntuacion(textoUsuario, fraseCompleta) {
        if (!textoUsuario || textoUsuario.length < 2) return 0;
        const usuarioLower = textoUsuario.toLowerCase().trim();
        const fraseLower = fraseCompleta.toLowerCase();
        
        // Coincidencia exacta al principio (máxima)
        if (fraseLower.startsWith(usuarioLower)) return 1.0;
        
        // Coincidencia en cualquier parte (muy buena)
        if (fraseLower.includes(usuarioLower)) return 0.9;
        
        // Coincidencia por palabras sueltas (más de 3 letras)
        const palabrasUsuario = usuarioLower.split(/\s+/).filter(p => p.length >= 3);
        if (palabrasUsuario.length === 0) return 0;
        let matchCount = 0;
        for (const palabra of palabrasUsuario) {
            if (fraseLower.includes(palabra)) matchCount++;
        }
        const puntaje = (matchCount / palabrasUsuario.length) * 0.7;
        return Math.min(puntaje, 0.8);
    }

    _mejorSugerencia(textoActual) {
        if (!textoActual || textoActual.length < 2 || this.frasesCache.length === 0) return null;
        let mejor = null, mejorPuntaje = this.umbral;
        for (const frase of this.frasesCache) {
            const punt = this._calcularPuntuacion(textoActual, frase);
            if (punt > mejorPuntaje) {
                mejorPuntaje = punt;
                mejor = frase;
            }
        }
        return mejor;
    }

    actualizarGhostText() {
        if (this.frasesCache.length === 0) {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = null;
            return;
        }
        const texto = this.textarea.value;
        if (texto.length < 2) {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = null;
            return;
        }
        const sugerencia = this._mejorSugerencia(texto);
        if (!sugerencia) {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = null;
            return;
        }
        
        // Buscar la primera ocurrencia del texto en la sugerencia (no solo al inicio)
        const lowerTexto = texto.toLowerCase();
        const lowerSug = sugerencia.toLowerCase();
        const index = lowerSug.indexOf(lowerTexto);
        if (index === -1) {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = null;
            return;
        }
        // Extraer la parte después de la coincidencia
        const resto = sugerencia.substring(index + texto.length);
        if (resto.length < 2) {
            this.ghostDiv.style.display = 'none';
            return;
        }
        this.sugerenciaActual = sugerencia;
        
        // Mostrar ghost con el texto escrito y la parte sugerida en gris opaco
        const estilo = window.getComputedStyle(this.textarea);
        this.ghostDiv.style.fontFamily = estilo.fontFamily;
        this.ghostDiv.style.fontSize = estilo.fontSize;
        this.ghostDiv.style.lineHeight = estilo.lineHeight;
        this.ghostDiv.style.padding = estilo.padding;
        this.ghostDiv.style.left = '0px';
        this.ghostDiv.style.top = '0px';
        this.ghostDiv.style.width = `calc(100% - ${parseInt(estilo.paddingLeft) + parseInt(estilo.paddingRight)}px)`;
        this.ghostDiv.innerHTML = this.escapeHtml(texto) + `<span style="opacity:0.5;">${this.escapeHtml(resto)}</span>`;
        this.ghostDiv.style.display = 'block';
    }

    actualizarSugerenciasMenu() {
        if (this.frasesCache.length === 0) {
            this.sugerenciasDiv.style.display = 'none';
            return;
        }
        const texto = this.textarea.value;
        if (texto.length < 2) {
            this.sugerenciasDiv.style.display = 'none';
            return;
        }
        const puntuaciones = this.frasesCache.map(frase => ({
            frase: frase,
            similitud: this._calcularPuntuacion(texto, frase)
        }));
        const sugerenciasOrden = puntuaciones
            .filter(p => p.similitud >= this.umbral)
            .sort((a,b) => b.similitud - a.similitud)
            .slice(0, this.maxSugerencias);
        
        console.log(`🔍 Sugerencias para "${texto}":`, sugerenciasOrden.map(s => `${s.frase} (${Math.round(s.similitud*100)}%)`));
        
        if (sugerenciasOrden.length === 0) {
            this.sugerenciasDiv.style.display = 'none';
            return;
        }
        const rect = this.textarea.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
        this.sugerenciasDiv.style.top = `${rect.bottom + scrollTop + 5}px`;
        this.sugerenciasDiv.style.left = `${rect.left + scrollLeft}px`;
        this.sugerenciasDiv.style.width = `${rect.width}px`;
        
        this.sugerenciasDiv.innerHTML = sugerenciasOrden.map((sug, idx) => `
            <div data-frase="${this.escapeHtml(sug.frase)}" data-index="${idx}">
                <i class="fas fa-magic" style="margin-right:8px; color:#00cfff;"></i>
                <span>${this.escapeHtml(sug.frase.length > 80 ? sug.frase.substring(0,80)+'…' : sug.frase)}</span>
                <span class="small-pct">${Math.round(sug.similitud*100)}%</span>
            </div>
        `).join('');
        
        this.sugerenciasDiv.querySelectorAll('div').forEach(el => {
            el.addEventListener('click', () => this.completarConFrase(el.dataset.frase));
        });
        this.sugerenciasDiv.style.display = 'block';
        this.indiceSeleccionado = -1;
    }

    navegarMenu(delta) {
        const items = this.sugerenciasDiv.querySelectorAll('div');
        if (!items.length) return;
        this.indiceSeleccionado = Math.max(0, Math.min(items.length-1, this.indiceSeleccionado + delta));
        items.forEach((item, i) => {
            if (i === this.indiceSeleccionado) item.classList.add('selected');
            else item.classList.remove('selected');
        });
        if (this.indiceSeleccionado >= 0) items[this.indiceSeleccionado].scrollIntoView({ block: 'nearest' });
    }

    completarConFrase(frase) {
        this.textarea.value = frase;
        this.actualizarGhostText();
        this.sugerenciasDiv.style.display = 'none';
        this.dispatchEvent(new Event('change', { bubbles: true }));
        this.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { texto: frase } }));
        this.textarea.focus();
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
    }

    async cargarFrasesIniciales() {
        await this.actualizarFrasesPorContexto();
        this.actualizarGhostText();
    }
}

if (!customElements.get('auto-descripcion')) {
    customElements.define('auto-descripcion', AutoDescripcion);
    console.log('✅ Componente auto-descripcion registrado');
}