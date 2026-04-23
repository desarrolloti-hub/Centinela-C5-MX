// /components/autoDescripcion.js
// Componente autónomo para autocompletar descripciones
// No requiere pasarle db; obtiene Firestore de window.firestore o firebase global
// Si no hay conexión, usa frases por defecto sin errores

class AutoDescripcion {
    constructor(textareaId, categoriaSelectId, subcategoriaSelectId, options = {}) {
        this.textarea = document.getElementById(textareaId);
        this.categoriaSelect = document.getElementById(categoriaSelectId);
        this.subcategoriaSelect = document.getElementById(subcategoriaSelectId);
        
        if (!this.textarea) {
            console.error(`AutoDescripcion: No se encontró el textarea con id "${textareaId}"`);
            return;
        }

        // Configuración
        this.coleccion = options.coleccion || 'sugerenciasDescripcion';
        this.organizacion = options.organizacion || null;
        this.umbral = options.umbral || 0.55;
        this.maxSugerencias = options.maxSugerencias || 4;
        this.frasesCache = [];
        this.onAutocomplete = options.onAutocomplete || null;
        this.sugerenciasContainer = null;
        this.debounceTimer = null;

        // Crear contenedor flotante
        this.crearContenedorSugerencias();
        
        // Cargar frases iniciales
        this.cargarFrasesIniciales();
        
        // Configurar eventos
        this.iniciarEventos();
        this.escucharCambiosContexto();
    }

    // ========== OBTENER FIRESTORE DESDE VARIABLES GLOBALES ==========
    _getFirestore() {
        // 1. Intentar desde window.firestore (asignado en firebase-config.js)
        if (window.firestore && typeof window.firestore.collection === 'function') {
            return window.firestore;
        }
        // 2. Intentar desde firebase global (modo compat)
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            return firebase.firestore();
        }
        // 3. No disponible
        return null;
    }

    // ========== CARGAR FRASES SEGÚN CONTEXTO ==========
    async cargarFrasesIniciales() {
        await this.actualizarFrasesPorContexto();
    }

    async actualizarFrasesPorContexto() {
        const categoriaId = this.categoriaSelect?.value;
        const subcategoriaId = this.subcategoriaSelect?.value;
        const riesgoSelect = document.getElementById('nivelRiesgo');
        const nivelRiesgo = riesgoSelect?.value;

        const db = this._getFirestore();
        
        // Si no hay Firestore, usar frases por defecto
        if (!db) {
            console.warn('⚠️ AutoDescripcion: Firestore no disponible, usando frases por defecto');
            this.frasesCache = this.obtenerFrasesPorDefecto();
            return;
        }

        try {
            let query = db.collection(this.coleccion);
            
            if (this.organizacion) {
                query = query.where('organizacion', '==', this.organizacion);
            }
            if (categoriaId && categoriaId !== '') {
                query = query.where('categoriaId', '==', categoriaId);
            }
            if (subcategoriaId && subcategoriaId !== '') {
                query = query.where('subcategoriaId', '==', subcategoriaId);
            }
            if (nivelRiesgo && nivelRiesgo !== '') {
                query = query.where('nivelRiesgo', '==', nivelRiesgo);
            }
            
            query = query.orderBy('vecesUsada', 'desc').limit(30);
            const snapshot = await query.get();
            
            const frases = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.texto && data.activa !== false) {
                    frases.push(data.texto);
                }
            });
            
            this.frasesCache = frases.length ? frases : this.obtenerFrasesPorDefecto();
        } catch (error) {
            console.error('❌ Error cargando sugerencias desde Firestore:', error);
            this.frasesCache = this.obtenerFrasesPorDefecto();
        }
    }

    obtenerFrasesPorDefecto() {
        return [
            "Durante el monitoreo del sistema de CCTV se detecta extintor sin señalización.",
            "Durante el monitoreo del sistema de CCTV se detecta acumulación de tarimas chep en el exterior de la sucursal.",
            "Durante el monitoreo del sistema de CCTV se detecta mercancía encima de enfriadores.",
            "farderas intento de robo salieron por acceso de cajas. La guardia lo detecta y corre a checar el carrito.",
            "SE RECIBE REPORTE POR PARTE DE MONITORISTA informando que ingresa a sucursal un masculino sospechoso.",
            "Personal de tienda reporta falta de equipo de mitigación de incendios.",
            "Se observa a un sujeto ocultando mercancía entre sus prendas. Al abordarlo a la salida se recupera el producto."
        ];
    }

    // ========== CREAR CONTENEDOR FLOTANTE ==========
    crearContenedorSugerencias() {
        const contenedor = document.createElement('div');
        contenedor.id = 'autoDescripcion-sugerencias';
        contenedor.style.cssText = `
            position: absolute;
            background: var(--color-bg-secondary, #1e1e2f);
            border: 1px solid var(--color-accent-primary, #00cfff);
            border-radius: 8px;
            max-width: 90%;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: none;
        `;
        this.textarea.parentNode.style.position = 'relative';
        this.textarea.parentNode.appendChild(contenedor);
        this.sugerenciasContainer = contenedor;
    }

    // ========== ALGORITMO DE SIMILITUD ==========
    normalizarTexto(texto) {
        return texto.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[.,;:!?¿¡()\-_]/g, ' ')
            .split(/\s+/)
            .filter(palabra => palabra.length > 2);
    }

    calcularSimilitud(texto1, texto2) {
        const palabras1 = new Set(this.normalizarTexto(texto1));
        const palabras2 = new Set(this.normalizarTexto(texto2));
        if (palabras1.size === 0 || palabras2.size === 0) return 0;
        const interseccion = new Set([...palabras1].filter(x => palabras2.has(x)));
        const union = new Set([...palabras1, ...palabras2]);
        return interseccion.size / union.size;
    }

    obtenerSugerencias(textoActual) {
        if (!textoActual || textoActual.length < 10) return [];
        const puntuaciones = this.frasesCache.map(frase => ({
            frase,
            similitud: this.calcularSimilitud(textoActual, frase)
        }));
        return puntuaciones
            .filter(p => p.similitud >= this.umbral)
            .sort((a,b) => b.similitud - a.similitud)
            .slice(0, this.maxSugerencias);
    }

    // ========== MOSTRAR SUGERENCIAS ==========
    mostrarSugerencias(sugerencias) {
        if (!sugerencias.length) {
            if (this.sugerenciasContainer) this.sugerenciasContainer.style.display = 'none';
            return;
        }
        
        const rect = this.textarea.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        this.sugerenciasContainer.style.top = `${rect.bottom + scrollTop + 5}px`;
        this.sugerenciasContainer.style.left = `${rect.left + window.scrollX}px`;
        this.sugerenciasContainer.style.width = `${rect.width}px`;

        this.sugerenciasContainer.innerHTML = sugerencias.map(sug => `
            <div class="autoDescripcion-item" data-frase="${this.escapeHtml(sug.frase)}" style="
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid rgba(0,207,255,0.2);
                transition: background 0.2s;
            ">
                <i class="fas fa-magic" style="margin-right: 8px; color: #00cfff;"></i>
                <span>${this.escapeHtml(sug.frase.length > 80 ? sug.frase.substring(0,80)+'…' : sug.frase)}</span>
                <small style="float:right; opacity:0.6;">${Math.round(sug.similitud*100)}%</small>
            </div>
        `).join('');

        this.sugerenciasContainer.querySelectorAll('.autoDescripcion-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const fraseCompleta = el.dataset.frase;
                this.textarea.value = fraseCompleta;
                this.textarea.dispatchEvent(new Event('input'));
                this.sugerenciasContainer.style.display = 'none';
                if (this.onAutocomplete) this.onAutocomplete(fraseCompleta);
                this.textarea.focus();
            });
            el.addEventListener('mouseenter', () => el.style.backgroundColor = 'rgba(0,207,255,0.2)');
            el.addEventListener('mouseleave', () => el.style.backgroundColor = 'transparent');
        });

        this.sugerenciasContainer.style.display = 'block';
    }

    escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // ========== EVENTOS ==========
    escucharCambiosContexto() {
        if (this.categoriaSelect) {
            this.categoriaSelect.addEventListener('change', () => this.actualizarFrasesPorContexto());
        }
        if (this.subcategoriaSelect) {
            this.subcategoriaSelect.addEventListener('change', () => this.actualizarFrasesPorContexto());
        }
        const riesgoSelect = document.getElementById('nivelRiesgo');
        if (riesgoSelect) {
            riesgoSelect.addEventListener('change', () => this.actualizarFrasesPorContexto());
        }
    }

    iniciarEventos() {
        this.textarea.addEventListener('input', (e) => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                const texto = e.target.value;
                const sugerencias = this.obtenerSugerencias(texto);
                this.mostrarSugerencias(sugerencias);
            }, 400);
        });

        this.textarea.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.sugerenciasContainer) this.sugerenciasContainer.style.display = 'none';
            }, 200);
        });

        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.sugerenciasContainer?.style.display === 'block') {
                this.sugerenciasContainer.style.display = 'none';
                e.preventDefault();
            }
        });
    }

    // Método público para actualizar frases manualmente
    actualizarFrases(nuevasFrases) {
        this.frasesCache = nuevasFrases;
    }
}

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
    window.AutoDescripcion = AutoDescripcion;
}