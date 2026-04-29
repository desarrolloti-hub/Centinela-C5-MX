// autoDescripcion.js - Componente con sugerencias desde Firestore + palabras locales
import { FrasesAutoCompletarManager } from '/clases/frasesAutoCompletar.js';

// 📚 Lista de palabras comunes para autocompletado local (sin conexión a BD)
const PALABRAS_COMUNES = [
    "robo", "asalto", "daño", "vandalismo", "fuga", "accidente", "incendio",
    "falla eléctrica", "fuga de gas", "inundación", "violación de perímetro",
    "alerta sísmica", "persona sospechosa", "vehículo sospechoso", "golpe",
    "rotura", "mal funcionamiento", "hurto", "extorsión", "amenaza",
    "lesionado", "desmayo", "caída", "emergencia médica", "corto circuito",
    "intento de robo", "daño estructural", "pérdida de energía", "fuga de agua"
];

class AutoDescripcion extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.frasesManager = null;
        this.sugerenciaActual = "";          // texto completo que se sugiere (ghost)
        this.frasesCoincidentes = [];         // lista de sugerencias actuales (para dropdown)
        this.indiceSeleccionado = -1;         // índice seleccionado en el dropdown
        this.ultimoTexto = "";                // para evitar procesar el mismo input múltiples veces
    }

    static get observedAttributes() {
        return ['organizacion', 'categoria-id', 'subcategoria-id'];
    }

    async connectedCallback() {
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

        // Eventos del textarea
        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.textarea.addEventListener('blur', () => {
            setTimeout(() => { this.ocultarSugerenciasYGhost(); }, 200);
        });

        const org = this.getAttribute('organizacion');
        if (org) console.log(`📁 auto-descripcion inicializado con organización: ${org}`);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        console.log(`🔄 Atributo ${name} cambiado: ${newValue}`);
        if (this.textarea && this.textarea.value.length >= 2) {
            this.onInput();  // refrescar sugerencias con nuevos filtros
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
                <textarea rows="5" placeholder="Describe la incidencia... (escribe, usa ↑/↓ y presiona Tab para autocompletar)"></textarea>
                <div class="ghost-text"></div>
            </div>
            <div class="sugerencias"></div>
        `;
    }

    // ================== LÓGICA DE SUGERENCIAS COMBINADAS ==================
    async onInput() {
        const texto = this.textarea.value;
        if (texto === this.ultimoTexto) return;
        this.ultimoTexto = texto;

        if (texto.length < 2) {
            this.ocultarSugerenciasYGhost();
            return;
        }

        // 1️⃣ Obtener sugerencias desde Firestore (si el manager está disponible)
        let frasesFirestore = [];
        const organizacion = this.getAttribute('organizacion');
        const categoriaId = this.getAttribute('categoria-id') || '';
        const subcategoriaId = this.getAttribute('subcategoria-id') || '';

        if (organizacion && this.frasesManager) {
            try {
                frasesFirestore = await this.frasesManager.obtenerFrasesSugeridas(organizacion, categoriaId, subcategoriaId, 10);
                console.log(`📚 Frases Firestore: ${frasesFirestore.length}`);
            } catch (error) {
                console.warn('Error obteniendo frases de Firestore (se usará solo modo local):', error);
            }
        }

        // 2️⃣ Generar sugerencias locales basadas en la última palabra
        const palabras = texto.split(/\s+/);
        const ultimaPalabra = palabras[palabras.length - 1];
        const textoLower = texto.toLowerCase();

        let sugerenciasLocales = [];
        if (ultimaPalabra && ultimaPalabra.length >= 2) {
            sugerenciasLocales = PALABRAS_COMUNES.filter(palabra =>
                palabra.toLowerCase().startsWith(ultimaPalabra.toLowerCase())
            ).map(p => p); // solo la palabra, pero podemos convertir en frases completas si se desea
        }

        // 3️⃣ Combinar: primero las frases de Firestore (coincidencia parcial o completa)
        let frasesCombinadas = [];
        
        // Frases de Firestore que contengan el texto actual (coincidencia en cualquier parte)
        const frasesFirestoreCoincidentes = frasesFirestore
            .filter(f => f.texto.toLowerCase().includes(textoLower))
            .map(f => f.texto);
        
        // Sugerencias locales que coinciden exactamente con la última palabra (para completar palabras simples)
        // Pero también podemos mostrar frases completas que comiencen con la última palabra
        const sugerenciasLocalesFrase = sugerenciasLocales.map(p => {
            // Reemplazar la última palabra del texto actual por la sugerencia completa
            const palabrasTemp = [...palabras];
            palabrasTemp[palabrasTemp.length - 1] = p;
            return palabrasTemp.join(' ');
        });

        // Unir sin duplicados
        const conjunto = new Set([...frasesFirestoreCoincidentes, ...sugerenciasLocalesFrase]);
        frasesCombinadas = Array.from(conjunto);

        if (frasesCombinadas.length === 0) {
            this.ocultarSugerenciasYGhost();
            return;
        }

        // Guardar lista para navegación
        this.frasesCoincidentes = frasesCombinadas;
        this.indiceSeleccionado = -1;

        // Mostrar menú desplegable
        this.mostrarMenu(frasesCombinadas);

        // Ghost text solo si alguna sugerencia empieza exactamente con el texto actual
        const mejorCoincidenciaExacta = frasesCombinadas.find(f => f.toLowerCase().startsWith(textoLower));
        if (mejorCoincidenciaExacta) {
            const resto = mejorCoincidenciaExacta.substring(texto.length);
            if (resto.length > 0) {
                this.sugerenciaActual = mejorCoincidenciaExacta;
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

    // ================== NAVEGACIÓN POR TECLADO ==================
    onKeyDown(e) {
        const visible = this.sugerenciasDiv.style.display === 'block';
        if (!visible) {
            // Si no hay sugerencias, pero sí ghost text, Tab puede aceptar ghost
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
                    const textoSeleccionado = this.frasesCoincidentes[this.indiceSeleccionado];
                    this.textarea.value = textoSeleccionado;
                    this.ocultarSugerenciasYGhost();
                    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    this.textarea.focus();
                } else if (this.sugerenciaActual) {
                    // Si no hay selección en dropdown pero hay ghost, aceptar ghost
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
                // Opcional: hacer scroll al elemento seleccionado
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
        // Sincronizar ghost text con la sugerencia seleccionada (opcional)
        if (this.indiceSeleccionado >= 0 && this.frasesCoincidentes[this.indiceSeleccionado]) {
            const textoSeleccionado = this.frasesCoincidentes[this.indiceSeleccionado];
            const textoActual = this.textarea.value;
            if (textoSeleccionado.toLowerCase().startsWith(textoActual.toLowerCase())) {
                const resto = textoSeleccionado.substring(textoActual.length);
                if (resto.length > 0) {
                    this.sugerenciaActual = textoSeleccionado;
                    this.mostrarGhost(textoActual, resto);
                }
            }
        }
    }

    // ================== MÉTODOS DE UI ==================
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

        // Agregar eventos click a cada sugerencia (sin interferir con la selección por teclado)
        this.sugerenciasDiv.querySelectorAll('div').forEach((div, idx) => {
            if (div.classList.contains('no-results')) return;
            div.addEventListener('click', () => {
                this.textarea.value = div.innerText;
                this.ocultarSugerenciasYGhost();
                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                this.textarea.focus();
            });
            // Al pasar mouse, actualizar la selección visual (opcional)
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
        this.indiceSeleccionado = -1;
        this.frasesCoincidentes = [];
    }

    escapeHtml(str) {
        return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
    }

    // ================== API pública para crearIncidencias.js ==================
    get value() {
        return this.textarea ? this.textarea.value : '';
    }
    
    set value(v) {
        if (this.textarea) {
            this.textarea.value = v;
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            this.onInput();  // actualizar ghost y sugerencias
        }
    }

    focus() {
        if (this.textarea) this.textarea.focus();
    }
}

if (!customElements.get('auto-descripcion')) {
    customElements.define('auto-descripcion', AutoDescripcion);
}
console.log('✅ Componente auto-descripcion mejorado con palabras locales y teclado');