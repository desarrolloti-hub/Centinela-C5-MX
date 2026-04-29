// autoDescripcion.js - Con ghost text siempre visible
import { FrasesAutoCompletarManager } from '/clases/frasesAutoCompletar.js';

const DICCIONARIO_LOCAL = [
    "robo", "asalto", "daño", "vandalismo", "fuga", "accidente", "incendio",
    "falla eléctrica", "fuga de gas", "inundación", "violación de perímetro",
    "alerta sísmica", "persona sospechosa", "vehículo sospechoso", "golpe",
    "rotura", "mal funcionamiento", "hurto", "extorsión", "amenaza",
    "lesionado", "desmayo", "caída", "emergencia médica", "corto circuito",
    "intento de robo", "daño estructural", "pérdida de energía"
];

class AutoDescripcion extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.frasesManager = null;
        this.sugerenciaActual = "";
        this.frasesCoincidentes = [];
        this.indiceSeleccionado = -1;
        this.ultimoTexto = "";
    }

    static get observedAttributes() {
        return ['organizacion', 'categoria-id', 'subcategoria-id'];
    }

    async connectedCallback() {
        try {
            this.frasesManager = new FrasesAutoCompletarManager();
        } catch (error) {
            console.warn('⚠️ FrasesManager no disponible', error);
        }
        this.render();
        this.textarea = this.shadowRoot.querySelector('textarea');
        this.ghostDiv = this.shadowRoot.querySelector('.ghost-text');
        this.sugerenciasDiv = this.shadowRoot.querySelector('.sugerencias');
        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.textarea.addEventListener('blur', () => {
            setTimeout(() => this.ocultarSugerenciasYGhost(), 200);
        });
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (this.textarea && this.textarea.value.length >= 2) {
            this.onInput();
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; position: relative; width: 100%; }
                .wrapper { position: relative; width: 100%; }
                textarea {
                    width: 100%;
                    padding: 14px;
                    border-radius: 20px;
                    border: 1px solid #2d2d44;
                    background: #1e1e2f;
                    color: white;
                    font-family: inherit;
                    font-size: 1rem;
                    line-height: 1.5;
                    resize: vertical;
                    position: relative;
                    z-index: 2;
                }
                textarea:focus { outline: none; border-color: #00cfff; }
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
                }
                .sugerencias {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    width: 100%;
                    background: #1a1a2e;
                    border: 1px solid #00cfff;
                    border-radius: 16px;
                    z-index: 10000;
                    display: none;
                    max-height: 280px;
                    overflow-y: auto;
                }
                .sugerencias div {
                    padding: 10px 14px;
                    cursor: pointer;
                    border-bottom: 1px solid rgba(0,207,255,0.2);
                    color: #eee;
                }
                .sugerencias div:hover, .sugerencias .selected {
                    background: rgba(0,207,255,0.2);
                }
                .sugerencias .no-results {
                    text-align: center;
                    color: #aaa;
                    cursor: default;
                }
            </style>
            <div class="wrapper">
                <textarea rows="5" placeholder="Describe la incidencia... (escribe, usa ↑/↓, presiona Tab para autocompletar)"></textarea>
                <div class="ghost-text"></div>
            </div>
            <div class="sugerencias"></div>
        `;
    }

    async onInput() {
        const texto = this.textarea.value;
        if (texto === this.ultimoTexto) return;
        this.ultimoTexto = texto;

        if (texto.length < 2) {
            this.ocultarSugerenciasYGhost();
            return;
        }

        const organizacion = this.getAttribute('organizacion');
        const categoriaId = this.getAttribute('categoria-id') || '';
        const subcategoriaId = this.getAttribute('subcategoria-id') || '';

        let frasesFirestore = [];
        if (organizacion && this.frasesManager) {
            try {
                frasesFirestore = await this.frasesManager.obtenerFrasesSugeridas(organizacion, categoriaId, subcategoriaId, 10);
            } catch (error) {}
        }

        const palabras = texto.split(/\s+/);
        const ultimaPalabra = palabras[palabras.length - 1];
        const textoLower = texto.toLowerCase();

        let sugerenciasLocales = [];
        if (ultimaPalabra && ultimaPalabra.length >= 2) {
            const coincidenciasPalabra = DICCIONARIO_LOCAL.filter(p =>
                p.toLowerCase().startsWith(ultimaPalabra.toLowerCase())
            );
            sugerenciasLocales = coincidenciasPalabra.map(sug => {
                const nuevasPalabras = [...palabras];
                nuevasPalabras[nuevasPalabras.length - 1] = sug;
                return nuevasPalabras.join(' ');
            });
        }

        const firestoreMatch = frasesFirestore
            .filter(f => f.texto.toLowerCase().includes(textoLower))
            .map(f => f.texto);

        const todas = [...new Set([...firestoreMatch, ...sugerenciasLocales])];

        if (todas.length === 0) {
            this.ocultarSugerenciasYGhost();
            return;
        }

        this.frasesCoincidentes = todas;
        this.indiceSeleccionado = -1;
        this.mostrarMenu(todas);

        // 👇 GHOST TEXT SIEMPRE con la primera sugerencia
        const sugerenciaGhost = todas[0];
        const resto = sugerenciaGhost.substring(texto.length);
        if (resto.length > 0) {
            this.sugerenciaActual = sugerenciaGhost;
            this.mostrarGhost(texto, resto);
        } else {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = "";
        }
    }

    onKeyDown(e) {
        const visible = this.sugerenciasDiv.style.display === 'block';
        if (!visible) {
            if (e.key === 'Tab' && this.sugerenciaActual) {
                e.preventDefault();
                this.aceptarSugerencia();
            }
            return;
        }

        const items = this.sugerenciasDiv.querySelectorAll('div:not(.no-results)');
        if (items.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.indiceSeleccionado = (this.indiceSeleccionado + 1) % items.length;
                this.actualizarSeleccion(items);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.indiceSeleccionado = (this.indiceSeleccionado - 1 + items.length) % items.length;
                this.actualizarSeleccion(items);
                break;
            case 'Tab':
            case 'Enter':
                e.preventDefault();
                if (this.indiceSeleccionado >= 0 && this.indiceSeleccionado < this.frasesCoincidentes.length) {
                    const textoElegido = this.frasesCoincidentes[this.indiceSeleccionado];
                    this.textarea.value = textoElegido;
                    this.ocultarSugerenciasYGhost();
                    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    this.textarea.focus();
                } else if (this.sugerenciaActual) {
                    this.aceptarSugerencia();
                }
                break;
            case 'Escape':
                this.ocultarSugerenciasYGhost();
                break;
        }
    }

    actualizarSeleccion(items) {
        items.forEach((item, idx) => {
            if (idx === this.indiceSeleccionado) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
                // Actualizar ghost text con la sugerencia seleccionada
                if (this.frasesCoincidentes[idx]) {
                    const textoActual = this.textarea.value;
                    const sugerenciaSeleccionada = this.frasesCoincidentes[idx];
                    const resto = sugerenciaSeleccionada.substring(textoActual.length);
                    if (resto.length > 0) {
                        this.sugerenciaActual = sugerenciaSeleccionada;
                        this.mostrarGhost(textoActual, resto);
                    } else {
                        this.ghostDiv.style.display = 'none';
                    }
                }
            } else {
                item.classList.remove('selected');
            }
        });
    }

    mostrarMenu(frases) {
        this.sugerenciasDiv.style.width = `${this.textarea.clientWidth}px`;
        if (frases.length === 0) {
            this.sugerenciasDiv.innerHTML = `<div class="no-results">Sin sugerencias</div>`;
        } else {
            this.sugerenciasDiv.innerHTML = frases.map(f => `<div>${this.escapeHtml(f)}</div>`).join('');
        }
        this.sugerenciasDiv.style.display = 'block';

        const divs = this.sugerenciasDiv.querySelectorAll('div:not(.no-results)');
        divs.forEach((div, idx) => {
            div.addEventListener('click', () => {
                this.textarea.value = div.innerText;
                this.ocultarSugerenciasYGhost();
                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                this.textarea.focus();
            });
            div.addEventListener('mouseenter', () => {
                this.indiceSeleccionado = idx;
                const items = this.sugerenciasDiv.querySelectorAll('div:not(.no-results)');
                this.actualizarSeleccion(items);
            });
        });
    }

    mostrarGhost(textoEscrito, resto) {
        const estilo = window.getComputedStyle(this.textarea);
        this.ghostDiv.style.fontFamily = estilo.fontFamily;
        this.ghostDiv.style.fontSize = estilo.fontSize;
        this.ghostDiv.style.lineHeight = estilo.lineHeight;
        this.ghostDiv.style.padding = estilo.padding;
        this.ghostDiv.style.width = `calc(100% - ${parseInt(estilo.paddingLeft) + parseInt(estilo.paddingRight)}px)`;
        this.ghostDiv.innerHTML = this.escapeHtml(textoEscrito) + `<span style="opacity:0.5;">${this.escapeHtml(resto)}</span>`;
        this.ghostDiv.style.display = 'block';
    }

    aceptarSugerencia() {
        if (this.sugerenciaActual) {
            this.textarea.value = this.sugerenciaActual;
            this.ocultarSugerenciasYGhost();
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            this.textarea.focus();
        }
    }

    ocultarSugerenciasYGhost() {
        this.sugerenciasDiv.style.display = 'none';
        this.ghostDiv.style.display = 'none';
        this.sugerenciaActual = "";
        this.indiceSeleccionado = -1;
        this.frasesCoincidentes = [];
    }

    escapeHtml(str) {
        return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
    }

    get value() {
        return this.textarea ? this.textarea.value : '';
    }

    set value(v) {
        if (this.textarea) {
            this.textarea.value = v;
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            this.onInput();
        }
    }

    focus() {
        if (this.textarea) this.textarea.focus();
    }
}

if (!customElements.get('auto-descripcion')) {
    customElements.define('auto-descripcion', AutoDescripcion);
}
console.log('✅ Componente auto-descripcion con ghost text siempre visible');