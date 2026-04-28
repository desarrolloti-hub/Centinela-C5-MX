// autoDescripcion.js - Componente con sugerencias desde Firestore
import { FrasesAutoCompletarManager } from '/clases/frasesAutoCompletar.js';

class AutoDescripcion extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.frasesManager = null;
        this.sugerenciaActual = "";
        this.frasesCoincidentes = [];   // guarda las sugerencias actuales
    }

    // Atributos que vamos a observar para recargar sugerencias
    static get observedAttributes() {
        return ['organizacion', 'categoria-id', 'subcategoria-id'];
    }

    async connectedCallback() {
        // Inicializar el manager de frases
        try {
            this.frasesManager = new FrasesAutoCompletarManager();
            console.log('✅ FrasesManager inicializado en auto-descripcion');
        } catch (error) {
            console.error('❌ Error al inicializar FrasesManager:', error);
        }

        this.render();
        this.textarea = this.shadowRoot.querySelector('textarea');
        this.ghostDiv = this.shadowRoot.querySelector('.ghost-text');
        this.sugerenciasDiv = this.shadowRoot.querySelector('.sugerencias');
        
        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && this.sugerenciaActual) {
                e.preventDefault();
                this.aceptarSugerencia();
            } else if (e.key === 'Escape') {
                this.sugerenciasDiv.style.display = 'none';
                this.ghostDiv.style.display = 'none';
            }
        });
        this.textarea.addEventListener('blur', () => {
            setTimeout(() => { this.sugerenciasDiv.style.display = 'none'; }, 200);
        });
        
        // Si ya hay organización al cargar, podríamos precargar sugerencias (opcional)
        const org = this.getAttribute('organizacion');
        if (org) {
            console.log(`📁 auto-descripcion inicializado con organización: ${org}`);
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        console.log(`🔄 Atributo ${name} cambiado: ${newValue}`);
        // Cuando cambie la categoría o subcategoría, se pueden reiniciar sugerencias
        if (this.textarea && this.textarea.value.length >= 2) {
            this.onInput();  // refrescar sugerencias con los nuevos filtros
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
                    background: #1a1a2e;
                    border: 1px solid #00cfff;
                    border-radius: 16px;
                    max-width: 100%;
                    min-width: 240px;
                    z-index: 1000;
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
                .sugerencias .no-results:hover {
                    background: transparent;
                }
            </style>
            <div class="wrapper">
                <textarea rows="5" placeholder="Describe la incidencia... (escribe y presiona Tab para autocompletar)"></textarea>
                <div class="ghost-text"></div>
            </div>
            <div class="sugerencias"></div>
        `;
    }

    async onInput() {
        const texto = this.textarea.value;
        if (texto.length < 2) {
            this.ocultarSugerenciasYGhost();
            return;
        }

        // Obtener filtros desde los atributos
        const organizacion = this.getAttribute('organizacion');
        const categoriaId = this.getAttribute('categoria-id') || '';
        const subcategoriaId = this.getAttribute('subcategoria-id') || '';

        if (!organizacion) {
            console.warn('⚠️ auto-descripcion: falta el atributo "organizacion"');
            this.ocultarSugerenciasYGhost();
            return;
        }

        if (!this.frasesManager) {
            console.error('❌ FrasesManager no disponible');
            return;
        }

        // Obtener frases desde Firestore (solo las que tienen vecesUsada >= 3)
        let frases = [];
        try {
            frases = await this.frasesManager.obtenerFrasesSugeridas(organizacion, categoriaId, subcategoriaId, 15);
            console.log(`📚 Frases obtenidas: ${frases.length}`, frases);
        } catch (error) {
            console.error('Error al obtener frases sugeridas:', error);
            this.ocultarSugerenciasYGhost();
            return;
        }

        // Filtrar las que contengan el texto actual (insensible a mayúsculas)
        const textoLower = texto.toLowerCase();
        const coincidencias = frases.filter(f => f.texto.toLowerCase().includes(textoLower));
        
        if (coincidencias.length === 0) {
            this.ocultarSugerenciasYGhost();
            return;
        }

        // Mostrar el menú de sugerencias
        this.mostrarMenu(coincidencias.map(f => f.texto));

        // Ghost text predictivo (solo si alguna coincide desde el inicio)
        const mejorCoincidencia = coincidencias.find(f => f.texto.toLowerCase().startsWith(textoLower));
        if (mejorCoincidencia) {
            const resto = mejorCoincidencia.texto.substring(texto.length);
            if (resto.length > 0) {
                this.sugerenciaActual = mejorCoincidencia.texto;
                this.mostrarGhost(texto, resto);
            } else {
                this.ghostDiv.style.display = 'none';
                this.sugerenciaActual = "";
            }
        } else {
            this.ghostDiv.style.display = 'none';
            this.sugerenciaActual = "";
        }
    }

    mostrarMenu(frases) {
        const rect = this.textarea.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
        this.sugerenciasDiv.style.top = `${rect.bottom + scrollTop + 5}px`;
        this.sugerenciasDiv.style.left = `${rect.left + scrollLeft}px`;
        this.sugerenciasDiv.style.width = `${rect.width}px`;
        
        if (frases.length === 0) {
            this.sugerenciasDiv.innerHTML = `<div class="no-results">Sin sugerencias</div>`;
        } else {
            this.sugerenciasDiv.innerHTML = frases.map(f => `<div>${this.escapeHtml(f)}</div>`).join('');
        }
        this.sugerenciasDiv.style.display = 'block';

        // Agregar eventos click a cada sugerencia
        this.sugerenciasDiv.querySelectorAll('div').forEach(div => {
            // Evitar el evento en el mensaje "Sin sugerencias"
            if (div.classList.contains('no-results')) return;
            div.addEventListener('click', () => {
                this.textarea.value = div.innerText;
                this.ocultarSugerenciasYGhost();
                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                this.textarea.focus();
            });
        });
    }

    mostrarGhost(textoEscrito, resto) {
        const estilo = window.getComputedStyle(this.textarea);
        this.ghostDiv.style.fontFamily = estilo.fontFamily;
        this.ghostDiv.style.fontSize = estilo.fontSize;
        this.ghostDiv.style.lineHeight = estilo.lineHeight;
        this.ghostDiv.style.padding = estilo.padding;
        this.ghostDiv.style.left = '0px';
        this.ghostDiv.style.top = '0px';
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
    }

    escapeHtml(str) {
        return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
    }

    // Getters y setters para value (necesario para que crearIncidencias.js pueda leer/escribir)
    get value() {
        return this.textarea ? this.textarea.value : '';
    }
    
    set value(v) {
        if (this.textarea) {
            this.textarea.value = v;
            // Disparar evento input manualmente para actualizar validaciones
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            this.onInput();  // para actualizar ghost y sugerencias si es necesario
        }
    }

    // Método para enfocar el textarea
    focus() {
        if (this.textarea) this.textarea.focus();
    }
}

// Registrar el componente solo si no está ya registrado
if (!customElements.get('auto-descripcion')) {
    customElements.define('auto-descripcion', AutoDescripcion);
}
console.log('✅ Componente auto-descripcion con integración a Firestore registrado');