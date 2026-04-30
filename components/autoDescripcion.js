// autoDescripcion.js - Solo ghost text con autocompletado con TAB
import { FrasesAutoCompletarManager } from '/clases/frasesAutoCompletar.js';

const DICCIONARIO_LOCAL = [
    "robo", "asalto", "daño", "vandalismo", "fuga", "accidente", "incendio",
    "falla eléctrica", "fuga de gas", "inundación", "violación de perímetro",
    "alerta sísmica", "persona sospechosa", "personal en tienda", "vehículo sospechoso", "golpe",
    "rotura", "mal funcionamiento", "hurto", "extorsión", "amenaza",
    "lesionado", "desmayo", "caída", "emergencia médica", "corto circuito",
    "intento de robo", "daño estructural", "pérdida de energía", "mediante el monitoreo cctv"
];

class AutoDescripcion extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.frasesManager = null;
        this.sugerenciaActual = "";
        this.ultimoTexto = "";
    }

    static get observedAttributes() {
        return ['organizacion', 'categoria-id', 'subcategoria-id'];
    }

    async connectedCallback() {
        this.render();
        this.textarea = this.shadowRoot.querySelector('textarea');
        this.ghostDiv = this.shadowRoot.querySelector('.ghost-text');

        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.textarea.addEventListener('blur', () => {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = "";
        });

        const org = this.getAttribute('organizacion');
        if (org) {
            this._inicializarManager(org);
        }
    }

    _inicializarManager(org) {
        if (this.frasesManager) return;
        try {
            this.frasesManager = new FrasesAutoCompletarManager(org);
           
        } catch (error) {
            console.warn('⚠️ FrasesManager no disponible', error);
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'organizacion' && newValue && !this.frasesManager) {
            this._inicializarManager(newValue);
        }
        if (this.textarea && this.textarea.value.length >= 2) {
            this.onInput();
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; position: relative; width: 100%; }
                .wrapper {
                    position: relative;
                    width: 100%;
                    background: var(--color-bg-secondary, #1e1e2f);
                    border-radius: 20px;
                    border: 1px solid var(--color-border-light, #2d2d44);
                }
                textarea {
                    width: 100%;
                    padding: 14px;
                    background: transparent;
                    border: none;
                    color: var(--color-text-primary, white);
                    font-family: inherit;
                    font-size: 1rem;
                    line-height: 1.5;
                    resize: vertical;
                    position: relative;
                    z-index: 2;
                }
                textarea:focus {
                    outline: none;
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
                }
            </style>
            <div class="wrapper">
                <textarea rows="5" placeholder="Describe la incidencia... (escribe, presiona Tab para autocompletar)"></textarea>
                <div class="ghost-text"></div>
            </div>
        `;
    }

    async onInput() {
        const texto = this.textarea.value;
        if (texto === this.ultimoTexto) return;
        this.ultimoTexto = texto;

        if (texto.length < 2) {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = "";
            return;
        }

        let frasesFirestore = [];
        const organizacion = this.getAttribute('organizacion');
        const categoriaId = this.getAttribute('categoria-id') || '';
        const subcategoriaId = this.getAttribute('subcategoria-id') || '';

        if (organizacion && this.frasesManager) {
            try {
                frasesFirestore = await this.frasesManager.obtenerFrasesSugeridas(organizacion, categoriaId, subcategoriaId, 10);
            } catch (error) {
                // silencio
            }
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
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = "";
            return;
        }

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
        if (e.key === 'Tab' && this.sugerenciaActual) {
            e.preventDefault();
            this.aceptarSugerencia();
        } else if (e.key === 'Escape') {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = "";
        }
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
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = "";
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            this.textarea.focus();
        }
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
