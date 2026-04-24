// auto-descripcion.js
// Componente web <auto-descripcion> que sugiere descripciones desde Firestore (vecesUsada >= 3)

class AutoDescripcion extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.frasesCache = [];
        this.sugerenciaActual = null;
        this.indiceSeleccionado = -1;
        this.debounceTimer = null;
        this.coleccion = 'descripcionesIncidencias';
        this.organizacion = '';
        this.umbral = 0.55;
        this.maxSugerencias = 5;
    }

    static get observedAttributes() {
        return ['organizacion', 'umbral', 'max'];
    }

    connectedCallback() {
        this.organizacion = this.getAttribute('organizacion') || '';
        this.umbral = parseFloat(this.getAttribute('umbral')) || 0.55;
        this.maxSugerencias = parseInt(this.getAttribute('max')) || 5;
        this.db = window.firestore || (typeof firebase !== 'undefined' && firebase.firestore());
        this.render();
        this.iniciarEventos();
        this.cargarFrasesIniciales();
        this.observarCambiosContexto();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; position: relative; width: 100%; }
                textarea {
                    width: 100%;
                    padding: 14px;
                    border-radius: 20px;
                    border: 1px solid var(--color-border-light, #2d2d44);
                    background: var(--color-bg-secondary, #1e1e2f);
                    color: var(--color-text-primary, #fff);
                    font-family: inherit;
                    font-size: 1rem;
                    line-height: 1.5;
                    resize: vertical;
                    transition: 0.2s;
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
                    color: rgba(200,200,200,0.45);
                    font-family: inherit;
                    font-size: 1rem;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    pointer-events: none;
                    z-index: 1;
                    overflow: hidden;
                }
                .sugerencias {
                    position: absolute;
                    background: var(--color-bg-secondary, #1a1a2e);
                    border: 1px solid var(--color-accent-primary, #00cfff);
                    border-radius: 16px;
                    max-width: 100%;
                    min-width: 240px;
                    z-index: 1000;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    display: none;
                }
                .sugerencias div {
                    padding: 10px 14px;
                    cursor: pointer;
                    border-bottom: 1px solid rgba(0,207,255,0.2);
                    transition: 0.15s;
                    font-size: 0.9rem;
                    color: var(--color-text-secondary, #eee);
                }
                .sugerencias div:hover, .sugerencias .selected {
                    background: rgba(0,207,255,0.2);
                }
                .small-pct {
                    font-size: 0.7rem;
                    color: #88aaff;
                    float: right;
                }
            </style>
            <textarea rows="5" placeholder="Describe la incidencia... (ej: 'Durante el monitoreo')"></textarea>
            <div class="ghost-text"></div>
            <div class="sugerencias"></div>
        `;
        this.textarea = this.shadowRoot.querySelector('textarea');
        this.ghostDiv = this.shadowRoot.querySelector('.ghost-text');
        this.sugerenciasDiv = this.shadowRoot.querySelector('.sugerencias');
    }

    get value() { return this.textarea.value; }
    set value(v) { this.textarea.value = v; this.actualizarGhostText(); this.dispatchEvent(new Event('change', { bubbles: true })); }

    iniciarEventos() {
        this.textarea.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.actualizarGhostText();
            this.dispatchEvent(new Event('input', { bubbles: true }));
            this.debounceTimer = setTimeout(() => this.actualizarSugerenciasMenu(), 250);
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
            setTimeout(() => {
                this.sugerenciasDiv.style.display = 'none';
                this.ghostDiv.style.display = 'none';
            }, 200);
        });
    }

    observarCambiosContexto() {
        const categoriaSelect = document.getElementById('categoriaIncidencia');
        const subcategoriaSelect = document.getElementById('subcategoriaIncidencia');
        const actualizar = () => this.actualizarFrasesPorContexto();
        if (categoriaSelect) categoriaSelect.addEventListener('change', actualizar);
        if (subcategoriaSelect) subcategoriaSelect.addEventListener('change', actualizar);
    }

    async actualizarFrasesPorContexto() {
        const categoriaId = document.getElementById('categoriaIncidencia')?.dataset.selectedId || '';
        const subcategoriaId = document.getElementById('subcategoriaIncidencia')?.value || '';

        if (!this.db) { this.frasesCache = []; return; }
        try {
            let query = this.db.collection(this.coleccion)
                .where('organizacion', '==', this.organizacion)
                .where('activa', '==', true)
                .where('vecesUsada', '>=', 3);
            if (categoriaId) query = query.where('categoriaId', '==', categoriaId);
            if (subcategoriaId) query = query.where('subcategoriaId', '==', subcategoriaId);
            query = query.orderBy('vecesUsada', 'desc').limit(30);
            const snapshot = await query.get();
            const frases = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.texto && data.activa !== false) frases.push(data.texto);
            });
            this.frasesCache = frases;
        } catch (error) {
            console.warn('❌ Error al obtener sugerencias:', error);
            this.frasesCache = [];
        }
    }

    _calcularPuntuacion(textoUsuario, fraseCompleta) {
        const usuarioNorm = textoUsuario.toLowerCase().trim();
        const fraseNorm = fraseCompleta.toLowerCase();
        if (fraseNorm.startsWith(usuarioNorm)) return 1.0;
        const palabrasUsuario = new Set(usuarioNorm.split(/\s+/).filter(p => p.length > 2));
        const palabrasFrase = new Set(fraseNorm.split(/\s+/));
        if (palabrasUsuario.size === 0) return 0;
        const interseccion = new Set([...palabrasUsuario].filter(p => palabrasFrase.has(p)));
        const union = new Set([...palabrasUsuario, ...palabrasFrase]);
        return interseccion.size / union.size;
    }

    _mejorSugerencia(textoActual) {
        if (!textoActual || textoActual.length < 3 || this.frasesCache.length === 0) return null;
        let mejor = null, mejorPuntaje = this.umbral;
        for (const frase of this.frasesCache) {
            const punt = this._calcularPuntuacion(textoActual, frase);
            if (punt > mejorPuntaje) { mejorPuntaje = punt; mejor = frase; }
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
        const sugerencia = this._mejorSugerencia(texto);
        if (!sugerencia || !sugerencia.startsWith(texto)) {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = null;
            return;
        }
        const resto = sugerencia.substring(texto.length);
        if (resto.length < 2) return;
        this.sugerenciaActual = sugerencia;
        const estilo = getComputedStyle(this.textarea);
        this.ghostDiv.style.fontFamily = estilo.fontFamily;
        this.ghostDiv.style.fontSize = estilo.fontSize;
        this.ghostDiv.style.lineHeight = estilo.lineHeight;
        this.ghostDiv.style.padding = estilo.padding;
        this.ghostDiv.style.left = estilo.paddingLeft;
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
        if (texto.length < 3) {
            this.sugerenciasDiv.style.display = 'none';
            return;
        }
        const puntuaciones = this.frasesCache.map(frase => ({ frase, similitud: this._calcularPuntuacion(texto, frase) }));
        const sugerenciasOrden = puntuaciones
            .filter(p => p.similitud >= this.umbral)
            .sort((a,b) => b.similitud - a.similitud)
            .slice(0, this.maxSugerencias);
        if (sugerenciasOrden.length === 0) {
            this.sugerenciasDiv.style.display = 'none';
            return;
        }
        const rect = this.textarea.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        this.sugerenciasDiv.style.top = `${rect.bottom + scrollTop + 5}px`;
        this.sugerenciasDiv.style.left = `${rect.left + window.scrollX}px`;
        this.sugerenciasDiv.style.width = `${rect.width}px`;
        this.sugerenciasDiv.innerHTML = sugerenciasOrden.map((sug, idx) => `
            <div data-frase="${this.escapeHtml(sug.frase)}" data-index="${idx}" style="${idx === this.indiceSeleccionado ? 'background:rgba(0,207,255,0.2);' : ''}">
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
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.textarea.focus();
    }

    escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    async cargarFrasesIniciales() {
        await this.actualizarFrasesPorContexto();
    }
}

// Registrar el componente (si no está ya registrado)
if (!customElements.get('auto-descripcion')) {
    customElements.define('auto-descripcion', AutoDescripcion);
}