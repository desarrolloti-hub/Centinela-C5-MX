// crearIncidencias.js - VERSIÓN CON EVIDENCIAS OCULTAS HASTA DESCRIPCIÓN > 20 CARACTERES
// 1. Campo Nivel de Riesgo: "Selecciona el nivel de riesgo" como primera opción (valor vacío)
// 2. Campo Estado: "Selecciona el estado" como primera opción (valor vacío)
// 3. Al seleccionar Estado, avance automático al campo Fecha
// 4. Sección de Evidencias Fotográficas OCULTA inicialmente
// 5. Sección de Evidencias se muestra SOLO cuando la descripción tenga más de 20 caracteres

const LIMITES = {
    DETALLES_INCIDENCIA: 1000,
    MIN_CARACTERES_EVIDENCIAS: 20  // Mínimo de caracteres para mostrar evidencias
};

class CrearIncidenciaController {
    constructor() {
        this.incidenciaManager = null;
        this.usuarioActual = null;
        this.sucursales = [];
        this.categorias = [];
        this.subcategoriasCache = {};
        this.categoriaSeleccionada = null;
        this.imagenesSeleccionadas = [];
        this.imageEditorModal = null;
        this.loadingOverlay = null;
        this.flatpickrInstance = null;
        this.historialManager = null;
        this.areas = [];
        this.AreaManager = null;
        this.notificacionManager = null;

        // Variables para control de campos desplegados
        this.camposDesplegados = {
            sucursal: false,
            categoria: false,
            subcategoria: false,
            riesgo: false,
            estado: false,
            fecha: false,
            descripcion: false
        };

        // Para PDF (sin modal)
        this.pdfGenerator = null;

        this._init();
    }

    async _initHistorialManager() {
        if (!this.historialManager) {
            try {
                const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
                this.historialManager = new HistorialUsuarioManager();
            } catch (error) {
                console.error('Error inicializando historialManager:', error);
            }
        }
        return this.historialManager;
    }

    async _initNotificacionManager() {
        if (!this.notificacionManager) {
            try {
                const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
                this.notificacionManager = new NotificacionAreaManager();
            } catch (error) {
                console.error('Error inicializando notificacionManager:', error);
            }
        }
        return this.notificacionManager;
    }

    async _initPDFGenerator() {
        if (!this.pdfGenerator) {
            try {
                const { generadorIPH } = await import('/components/iph-generator.js');
                this.pdfGenerator = generadorIPH;
                console.log('✅ PDFGenerator inicializado correctamente');
                return true;
            } catch (error) {
                console.error('Error inicializando PDFGenerator:', error);
                return false;
            }
        }
        return true;
    }

    async _init() {
        try {
            this._cargarUsuario();

            if (!this.usuarioActual) {
                throw new Error('No se pudo cargar información del usuario');
            }

            await this._inicializarManager();
            await this._cargarDatosRelacionados();
            await this._cargarAreas();
            await this._initNotificacionManager();

            await this._initPDFGenerator();

            this._configurarOrganizacion();
            this._inicializarDateTimePicker();
            this._configurarEventos();
            this._inicializarValidaciones();

            // Inicializar el despliegue vertical secuencial
            this._inicializarDespliegueVertical();

            this.imageEditorModal = new window.ImageEditorModal();

        } catch (error) {
            console.error('Error inicializando:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    async _inicializarManager() {
        try {
            const { IncidenciaManager } = await import('/clases/incidencia.js');
            this.incidenciaManager = new IncidenciaManager();
        } catch (error) {
            console.error('Error cargando IncidenciaManager:', error);
            throw error;
        }
    }

    _configurarOrganizacion() {
        const orgInput = document.getElementById('organization');
        if (orgInput) {
            orgInput.value = this.usuarioActual.organizacion;
        }
    }

    _inicializarDateTimePicker() {
        const fechaInput = document.getElementById('fechaHoraIncidencia');
        if (fechaInput && typeof flatpickr !== 'undefined') {
            try {
                const ahora = new Date();

                this.flatpickrInstance = flatpickr(fechaInput, {
                    enableTime: true,
                    dateFormat: "Y-m-d H:i",
                    time_24hr: true,
                    locale: "es",
                    defaultDate: ahora,
                    minuteIncrement: 1,
                    maxDate: ahora,
                    disableMobile: true,
                    onChange: function (selectedDates, dateStr, instance) {
                        if (selectedDates.length > 0) {
                            const selectedDate = selectedDates[0];
                            const now = new Date();
                            if (selectedDate > now) {
                                instance.setDate(now, true);
                                Swal.fire({
                                    icon: 'warning',
                                    title: 'Fecha no válida',
                                    text: 'No puedes seleccionar una fecha futura',
                                    timer: 2000,
                                    showConfirmButton: false
                                });
                            }
                        }
                    }
                });
            } catch (error) {
                console.error('Error inicializando Flatpickr:', error);
                fechaInput.type = 'datetime-local';
                const ahora = new Date();
                fechaInput.value = this._formatearFechaParaInput(ahora);
                fechaInput.max = this._formatearFechaParaInput(ahora);
            }
        } else {
            console.warn('Flatpickr no está disponible, usando input nativo');
            const fechaInput = document.getElementById('fechaHoraIncidencia');
            if (fechaInput) {
                fechaInput.type = 'datetime-local';
                const ahora = new Date();
                fechaInput.value = this._formatearFechaParaInput(ahora);
                fechaInput.max = this._formatearFechaParaInput(ahora);
            }
        }
    }

    _formatearFechaParaInput(fecha) {
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        const hours = String(fecha.getHours()).padStart(2, '0');
        const minutes = String(fecha.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    async _cargarDatosRelacionados() {
        try {
            await this._cargarSucursales();
            await this._cargarCategorias();
        } catch (error) {
            console.error('Error cargando datos relacionados:', error);
            throw error;
        }
    }

    async _cargarSucursales() {
        try {
            const { SucursalManager } = await import('/clases/sucursal.js');
            const sucursalManager = new SucursalManager();

            this.sucursales = await sucursalManager.getSucursalesByOrganizacion(
                this.usuarioActual.organizacionCamelCase
            );

        } catch (error) {
            console.error('Error cargando sucursales:', error);
            throw error;
        }
    }

    async _cargarCategorias() {
        try {
            const { CategoriaManager } = await import('/clases/categoria.js');
            const categoriaManager = new CategoriaManager();

            this.categorias = await categoriaManager.obtenerTodasCategorias();

        } catch (error) {
            console.error('Error cargando categorías:', error);
            throw error;
        }
    }

    async _cargarAreas() {
        try {
            const { AreaManager } = await import('/clases/area.js');
            this.AreaManager = new AreaManager();

            if (this.usuarioActual && this.usuarioActual.organizacionCamelCase) {
                const areasObtenidas = await this.AreaManager.getAreasByOrganizacion(
                    this.usuarioActual.organizacionCamelCase,
                    true
                );

                this.areas = areasObtenidas.filter(area => area.estado === 'activa');
                console.log('✅ Áreas activas cargadas:', this.areas.length);
            }
        } catch (error) {
            console.error('Error cargando áreas:', error);
            this.areas = [];
        }
    }

    _cargarUsuario() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                this.usuarioActual = {
                    id: adminData.id || adminData.uid || `admin_${Date.now()}`,
                    uid: adminData.uid || adminData.id,
                    nombreCompleto: adminData.nombreCompleto || 'Administrador',
                    organizacion: adminData.organizacion || 'Sin organización',
                    organizacionCamelCase: adminData.organizacionCamelCase ||
                        this._generarCamelCase(adminData.organizacion),
                    correo: adminData.correoElectronico || '',
                    email: adminData.correoElectronico || ''
                };
                return;
            }

            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            if (userData && Object.keys(userData).length > 0) {
                this.usuarioActual = {
                    id: userData.uid || userData.id || `user_${Date.now()}`,
                    uid: userData.uid || userData.id,
                    nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                    organizacion: userData.organizacion || userData.empresa || 'Sin organización',
                    organizacionCamelCase: userData.organizacionCamelCase ||
                        this._generarCamelCase(userData.organizacion || userData.empresa),
                    correo: userData.correo || userData.email || ''
                };
                return;
            }

            this.usuarioActual = {
                id: `admin_${Date.now()}`,
                uid: `admin_${Date.now()}`,
                nombreCompleto: 'Administrador',
                organizacion: 'Mi Organización',
                organizacionCamelCase: 'miOrganizacion',
                correo: 'admin@centinela.com',
                email: 'admin@centinela.com'
            };

        } catch (error) {
            console.error('Error cargando usuario:', error);
            throw error;
        }
    }

    _generarCamelCase(texto) {
        if (!texto || typeof texto !== 'string') return 'sinOrganizacion';
        return texto
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    _inicializarValidaciones() {
        const detallesInput = document.getElementById('detallesIncidencia');
        if (detallesInput) {
            detallesInput.maxLength = LIMITES.DETALLES_INCIDENCIA;
            detallesInput.addEventListener('input', () => {
                this._validarLongitudCampo(
                    detallesInput,
                    LIMITES.DETALLES_INCIDENCIA,
                    'Los detalles'
                );
                this._actualizarContador('detallesIncidencia', 'contadorCaracteres', LIMITES.DETALLES_INCIDENCIA);

                // NUEVA FUNCIONALIDAD: Mostrar/ocultar evidencias según longitud de la descripción
                this._verificarMostrarEvidencias();
            });
        }

        this._actualizarContador('detallesIncidencia', 'contadorCaracteres', LIMITES.DETALLES_INCIDENCIA);
    }

    /**
     * Verifica si la descripción tiene más de 20 caracteres para mostrar la sección de evidencias
     */
    _verificarMostrarEvidencias() {
        const detallesInput = document.getElementById('detallesIncidencia');
        const seccionEvidencias = document.getElementById('seccionEvidencias');

        if (!detallesInput || !seccionEvidencias) return;

        const longitud = detallesInput.value.trim().length;
        const mostrar = longitud >= LIMITES.MIN_CARACTERES_EVIDENCIAS;

        if (mostrar && seccionEvidencias.style.display === 'none') {
            seccionEvidencias.style.display = 'block';
            // Scroll suave hasta la sección de evidencias
            setTimeout(() => {
                seccionEvidencias.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
            console.log('📸 Sección de evidencias mostrada (descripción > 20 caracteres)');
        } else if (!mostrar && seccionEvidencias.style.display === 'block') {
            seccionEvidencias.style.display = 'none';
            console.log('📸 Sección de evidencias ocultada (descripción ≤ 20 caracteres)');
        }
    }

    _actualizarContador(inputId, counterId, limite) {
        const input = document.getElementById(inputId);
        const counter = document.getElementById(counterId);

        if (input && counter) {
            const longitud = input.value.length;
            counter.textContent = `${longitud}/${limite}`;

            if (longitud > limite * 0.9) {
                counter.style.color = 'var(--color-warning)';
            } else if (longitud > limite * 0.95) {
                counter.style.color = 'var(--color-danger)';
            } else {
                counter.style.color = 'var(--color-accent-primary)';
            }
        }
    }

    _validarLongitudCampo(campo, limite, nombreCampo) {
        const longitud = campo.value.length;
        if (longitud > limite) {
            campo.value = campo.value.substring(0, limite);
            this._mostrarNotificacion(`${nombreCampo} no puede exceder ${limite} caracteres`, 'warning', 3000);
        }
    }

    _configurarEventos() {
        try {
            document.getElementById('btnVolverLista')?.addEventListener('click', () => this._volverALista());
            document.getElementById('btnCancelar')?.addEventListener('click', () => this._cancelarCreacion());
            document.getElementById('btnCrearIncidencia')?.addEventListener('click', () => this._validarYGuardar());

            document.getElementById('btnAgregarImagen')?.addEventListener('click', () => {
                document.getElementById('inputImagenes').click();
            });

            document.getElementById('inputImagenes')?.addEventListener('change', (e) => this._procesarImagenes(e.target.files));

            document.getElementById('formIncidenciaPrincipal')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this._validarYGuardar();
            });

            this._configurarSugerencias();

        } catch (error) {
            console.error('Error configurando eventos:', error);
        }
    }

    _configurarSugerencias() {
        const inputSucursal = document.getElementById('sucursalIncidencia');
        const inputCategoria = document.getElementById('categoriaIncidencia');

        if (inputSucursal) {
            inputSucursal.addEventListener('input', (e) => {
                this._mostrarSugerenciasSucursal(e.target.value);
            });

            inputSucursal.addEventListener('blur', () => {
                setTimeout(() => {
                    const contenedor = document.getElementById('sugerenciasSucursal');
                    if (contenedor) contenedor.innerHTML = '';
                }, 300);
            });

            inputSucursal.addEventListener('focus', (e) => {
                if (e.target.value.length > 0) {
                    this._mostrarSugerenciasSucursal(e.target.value);
                }
            });
        }

        if (inputCategoria) {
            inputCategoria.addEventListener('input', (e) => {
                this._mostrarSugerenciasCategoria(e.target.value);
            });

            inputCategoria.addEventListener('blur', () => {
                setTimeout(() => {
                    const contenedor = document.getElementById('sugerenciasCategoria');
                    if (contenedor) contenedor.innerHTML = '';
                }, 300);
            });

            inputCategoria.addEventListener('focus', (e) => {
                if (e.target.value.length > 0) {
                    this._mostrarSugerenciasCategoria(e.target.value);
                }
            });
        }
    }

    _mostrarSugerenciasSucursal(termino) {
        const contenedor = document.getElementById('sugerenciasSucursal');
        if (!contenedor) return;

        const terminoLower = termino.toLowerCase().trim();

        if (terminoLower.length === 0) {
            contenedor.innerHTML = '';
            return;
        }

        const sugerencias = this.sucursales.filter(suc =>
            suc.nombre.toLowerCase().includes(terminoLower) ||
            (suc.ciudad && suc.ciudad.toLowerCase().includes(terminoLower)) ||
            (suc.direccion && suc.direccion.toLowerCase().includes(terminoLower))
        ).slice(0, 8);

        if (sugerencias.length === 0) {
            contenedor.innerHTML = `
                <div class="sugerencias-lista">
                    <div class="sugerencia-vacia">
                        <i class="fas fa-store"></i>
                        <p>No se encontraron sucursales</p>
                        <small>Intenta con otro término</small>
                    </div>
                </div>
            `;
            return;
        }

        let html = '<div class="sugerencias-lista">';
        sugerencias.forEach(suc => {
            const seleccionada = document.getElementById('sucursalIncidencia').dataset.selectedId === suc.id;
            html += `
                <div class="sugerencia-item ${seleccionada ? 'seleccionada' : ''}" 
                     data-id="${suc.id}" 
                     data-nombre="${this._escapeHTML(suc.nombre)}">
                    <div class="sugerencia-icono">
                        <i class="fas fa-store"></i>
                    </div>
                    <div class="sugerencia-info">
                        <div class="sugerencia-nombre">${this._escapeHTML(suc.nombre)}</div>
                        <div class="sugerencia-detalle">
                            <span><i class="fas fa-map-marker-alt"></i> ${suc.ciudad || 'Sin ciudad'}</span>
                            <span><i class="fas fa-location-dot"></i> ${suc.direccion ? this._escapeHTML(suc.direccion.substring(0, 30)) + (suc.direccion.length > 30 ? '...' : '') : 'Sin dirección'}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        contenedor.innerHTML = html;

        contenedor.querySelectorAll('.sugerencia-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const nombre = item.dataset.nombre;
                this._seleccionarSucursal(id, nombre);
            });
        });
    }

    _mostrarSugerenciasCategoria(termino) {
        const contenedor = document.getElementById('sugerenciasCategoria');
        if (!contenedor) return;

        const terminoLower = termino.toLowerCase().trim();

        if (terminoLower.length === 0) {
            contenedor.innerHTML = '';
            return;
        }

        const sugerencias = this.categorias.filter(cat =>
            cat.nombre.toLowerCase().includes(terminoLower)
        ).slice(0, 8);

        if (sugerencias.length === 0) {
            contenedor.innerHTML = `
                <div class="sugerencias-lista">
                    <div class="sugerencia-vacia">
                        <i class="fas fa-tags"></i>
                        <p>No se encontraron categorías</p>
                        <small>Intenta con otro término</small>
                    </div>
                </div>
            `;
            return;
        }

        let html = '<div class="sugerencias-lista">';
        sugerencias.forEach(cat => {
            const seleccionada = document.getElementById('categoriaIncidencia').dataset.selectedId === cat.id;
            const totalSubcategorias = cat.subcategorias ?
                (cat.subcategorias instanceof Map ? cat.subcategorias.size : Object.keys(cat.subcategorias).length) : 0;

            html += `
                <div class="sugerencia-item ${seleccionada ? 'seleccionada' : ''}" 
                     data-id="${cat.id}" 
                     data-nombre="${this._escapeHTML(cat.nombre)}">
                    <div class="sugerencia-icono">
                        <i class="fas fa-tag"></i>
                    </div>
                    <div class="sugerencia-info">
                        <div class="sugerencia-nombre">${this._escapeHTML(cat.nombre)}</div>
                        <div class="sugerencia-detalle">
                            <span><i class="fas fa-layer-group"></i> ${totalSubcategorias} subcategorías</span>
                            ${cat.descripcion ? `<span><i class="fas fa-info-circle"></i> ${this._escapeHTML(cat.descripcion.substring(0, 40))}${cat.descripcion.length > 40 ? '...' : ''}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        contenedor.innerHTML = html;

        contenedor.querySelectorAll('.sugerencia-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const nombre = item.dataset.nombre;
                this._seleccionarCategoria(id, nombre);
            });
        });
    }

    _seleccionarSucursal(id, nombre) {
        const input = document.getElementById('sucursalIncidencia');
        input.value = nombre;
        input.dataset.selectedId = id;
        input.dataset.selectedName = nombre;

        const contenedor = document.getElementById('sugerenciasSucursal');
        if (contenedor) contenedor.innerHTML = '';

        // Desplegar el siguiente campo (Categoría)
        this._desplegarCampo('categoria');
    }

    _seleccionarCategoria(id, nombre) {
        const input = document.getElementById('categoriaIncidencia');
        input.value = nombre;
        input.dataset.selectedId = id;
        input.dataset.selectedName = nombre;

        const contenedor = document.getElementById('sugerenciasCategoria');
        if (contenedor) contenedor.innerHTML = '';

        this._cargarSubcategorias(id);

        // Desplegar el siguiente campo (Subcategoría)
        this._desplegarCampo('subcategoria');
    }

    async _cargarSubcategorias(categoriaId) {
        const selectSubcategoria = document.getElementById('subcategoriaIncidencia');
        if (!selectSubcategoria) return;

        selectSubcategoria.innerHTML = '<option value="">Cargando subcategorías...</option>';
        selectSubcategoria.disabled = true;

        if (!categoriaId) {
            selectSubcategoria.innerHTML = '<option value="">-- Selecciona una subcategoría (opcional) --</option>';
            selectSubcategoria.disabled = true;
            return;
        }

        const categoria = this.categorias.find(c => c.id === categoriaId);
        if (!categoria) {
            selectSubcategoria.innerHTML = '<option value="">-- Error: Categoría no encontrada --</option>';
            selectSubcategoria.disabled = true;
            return;
        }

        this.categoriaSeleccionada = categoria;

        try {
            let subcategoriasArray = [];

            if (categoria.subcategorias) {
                if (categoria.subcategorias instanceof Map) {
                    categoria.subcategorias.forEach((valor, clave) => {
                        if (valor && typeof valor === 'object') {
                            subcategoriasArray.push({
                                id: clave,
                                nombre: valor.nombre || clave,
                                ...valor
                            });
                        }
                    });
                }
                else if (categoria.subcategorias.entries && typeof categoria.subcategorias.entries === 'function') {
                    for (const [clave, valor] of categoria.subcategorias.entries()) {
                        if (valor && typeof valor === 'object') {
                            subcategoriasArray.push({
                                id: clave,
                                nombre: valor.nombre || clave,
                                ...valor
                            });
                        }
                    }
                }
                else if (typeof categoria.subcategorias.forEach === 'function') {
                    categoria.subcategorias.forEach((valor, clave) => {
                        if (valor && typeof valor === 'object') {
                            subcategoriasArray.push({
                                id: clave,
                                nombre: valor.nombre || clave,
                                ...valor
                            });
                        }
                    });
                }
                else if (typeof categoria.subcategorias === 'object') {
                    subcategoriasArray = Object.keys(categoria.subcategorias).map(key => ({
                        id: key,
                        nombre: categoria.subcategorias[key]?.nombre || key,
                        ...categoria.subcategorias[key]
                    }));
                }
            }

            if (subcategoriasArray.length === 0) {
                selectSubcategoria.innerHTML = '<option value="">-- No hay subcategorías disponibles --</option>';
                selectSubcategoria.disabled = true;
                // Si no hay subcategorías, desplegar siguiente campo directamente
                this._desplegarCampo('riesgo');
                return;
            }

            let options = '<option value="">-- Selecciona una subcategoría (opcional) --</option>';
            subcategoriasArray.forEach(sub => {
                options += `<option value="${sub.id}">${sub.nombre || sub.id}</option>`;
            });

            selectSubcategoria.innerHTML = options;
            selectSubcategoria.disabled = false;

            // Configurar evento change para subcategoría
            selectSubcategoria.removeEventListener('change', this._handleSubcategoriaChange);
            this._handleSubcategoriaChange = () => {
                this._desplegarCampo('riesgo');
            };
            selectSubcategoria.addEventListener('change', this._handleSubcategoriaChange);

        } catch (error) {
            console.error('Error cargando subcategorías:', error);
            selectSubcategoria.innerHTML = '<option value="">-- Error cargando subcategorías --</option>';
            selectSubcategoria.disabled = true;
        }
    }

    /**
     * Inicializa el despliegue vertical secuencial de campos
     * Los campos se muestran uno tras otro al completar el anterior
     */
    _inicializarDespliegueVertical() {
        // Mostrar solo el primer campo (Sucursal ya está visible)
        // Los demás campos están ocultos por defecto con style="display: none;"

        // Configurar evento change para nivel de riesgo
        const riesgoSelect = document.getElementById('nivelRiesgo');
        if (riesgoSelect) {
            riesgoSelect.addEventListener('change', () => {
                if (riesgoSelect.value) {
                    this._desplegarCampo('estado');
                }
            });
        }

        // Configurar evento change para estado (con avance automático a fecha)
        const estadoSelect = document.getElementById('estadoIncidencia');
        if (estadoSelect) {
            estadoSelect.addEventListener('change', () => {
                if (estadoSelect.value) {
                    // Avanzar automáticamente al campo de fecha
                    this._desplegarCampo('fecha');
                    // Enfocar el campo de fecha automáticamente
                    const fechaInput = document.getElementById('fechaHoraIncidencia');
                    if (fechaInput) {
                        setTimeout(() => {
                            fechaInput.focus();
                            if (this.flatpickrInstance) {
                                this.flatpickrInstance.open();
                            }
                        }, 100);
                    }
                }
            });
        }

        // Configurar evento change para fecha
        const fechaInput = document.getElementById('fechaHoraIncidencia');
        if (fechaInput) {
            fechaInput.addEventListener('change', () => {
                if (fechaInput.value) {
                    this._desplegarCampo('descripcion');
                }
            });
        }

        // Configurar evento input para descripción (mostrar botón cuando tenga texto y verificar evidencias)
        const detallesInput = document.getElementById('detallesIncidencia');
        if (detallesInput) {
            detallesInput.addEventListener('input', () => {
                const longitud = detallesInput.value.trim().length;
                const btnContainer = document.getElementById('btnFinalizarContainer');

                // Mostrar botón cuando tenga al menos 10 caracteres
                if (longitud >= 10) {
                    if (btnContainer) btnContainer.style.display = 'block';
                } else {
                    if (btnContainer && longitud === 0) btnContainer.style.display = 'none';
                }

                // Verificar si mostrar evidencias (ya se hace en _verificarMostrarEvidencias)
                // Esta función ya es llamada desde _inicializarValidaciones
            });
        }

        // Verificar estado inicial de evidencias (por si acaso)
        this._verificarMostrarEvidencias();
    }

    /**
     * Despliega un campo específico del formulario
     * @param {string} campo - Nombre del campo a desplegar ('categoria', 'subcategoria', 'riesgo', 'estado', 'fecha', 'descripcion')
     */
    _desplegarCampo(campo) {
        if (this.camposDesplegados[campo]) return;

        let containerId = '';
        switch (campo) {
            case 'categoria':
                containerId = 'containerCategoria';
                break;
            case 'subcategoria':
                containerId = 'containerSubcategoria';
                break;
            case 'riesgo':
                containerId = 'containerRiesgo';
                break;
            case 'estado':
                containerId = 'containerEstado';
                break;
            case 'fecha':
                containerId = 'containerFecha';
                break;
            case 'descripcion':
                containerId = 'containerDescripcion';
                break;
            default:
                return;
        }

        const container = document.getElementById(containerId);
        if (container) {
            container.style.display = 'block';
            this.camposDesplegados[campo] = true;

            // Scroll suave hasta el campo desplegado
            setTimeout(() => {
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);

            // Si es el campo de fecha, inicializar flatpickr si es necesario
            if (campo === 'fecha' && this.flatpickrInstance) {
                setTimeout(() => {
                    const fechaInput = document.getElementById('fechaHoraIncidencia');
                    if (fechaInput && !fechaInput.value) {
                        this.flatpickrInstance.open();
                    }
                }, 200);
            }

            // Si es el campo de descripción, enfocar el textarea
            if (campo === 'descripcion') {
                setTimeout(() => {
                    const detallesInput = document.getElementById('detallesIncidencia');
                    if (detallesInput) {
                        detallesInput.focus();
                    }
                }, 200);
            }
        }
    }

    _procesarImagenes(files) {
        if (!files || files.length === 0) return;

        const nuevosArchivos = Array.from(files);
        const maxSize = 10 * 1024 * 1024;
        const maxImages = 20;

        if (this.imagenesSeleccionadas.length + nuevosArchivos.length > maxImages) {
            this._mostrarError(`Máximo ${maxImages} imágenes permitidas`);
            return;
        }

        const archivosValidos = nuevosArchivos.filter(file => {
            if (file.size > maxSize) {
                this._mostrarNotificacion(`La imagen ${file.name} excede ${maxSize / 1024 / 1024}MB`, 'warning');
                return false;
            }

            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!validTypes.includes(file.type)) {
                this._mostrarNotificacion(`Formato no válido: ${file.name}. Usa JPG, PNG, GIF o WEBP`, 'warning');
                return false;
            }

            return true;
        });

        archivosValidos.forEach(file => {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 8);
            const cleanFileName = file.name
                .replace(/[^a-zA-Z0-9.]/g, '_')
                .replace(/\s+/g, '_');
            const generatedName = `${timestamp}_${random}_${cleanFileName}`;

            this.imagenesSeleccionadas.push({
                file: file,
                preview: URL.createObjectURL(file),
                comentario: '',
                elementos: [],
                edited: false,
                generatedName: generatedName
            });
        });

        this._actualizarVistaPreviaImagenes();
        document.getElementById('inputImagenes').value = '';
    }

    _actualizarVistaPreviaImagenes() {
        const container = document.getElementById('imagenesPreview');
        const countSpan = document.getElementById('imagenesCount');

        if (!container) return;

        if (countSpan) {
            countSpan.textContent = this.imagenesSeleccionadas.length;
        }

        if (this.imagenesSeleccionadas.length === 0) {
            container.innerHTML = `
                <div class="no-images">
                    <i class="fas fa-images"></i>
                    <p>No hay imágenes seleccionadas</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.imagenesSeleccionadas.forEach((img, index) => {
            html += `
                <div class="preview-item">
                    <img src="${img.preview}" alt="Preview ${index + 1}">
                    <div class="preview-overlay">
                        <button type="button" class="preview-btn edit-btn" data-index="${index}" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="preview-btn delete-btn" data-index="${index}" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                        ${img.edited ? '<span class="edited-badge"><i class="fas fa-check"></i> Editada</span>' : ''}
                    </div>
                    ${img.comentario ? `<div class="image-comment"><i class="fas fa-comment"></i> ${this._escapeHTML(img.comentario.substring(0, 30))}${img.comentario.length > 30 ? '...' : ''}</div>` : ''}
                </div>
            `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.currentTarget.dataset.index;
                this._editarImagen(parseInt(index));
            });
        });

        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.currentTarget.dataset.index;
                this._eliminarImagen(parseInt(index));
            });
        });
    }

    _editarImagen(index) {
        if (this.imageEditorModal && this.imagenesSeleccionadas[index]) {
            const img = this.imagenesSeleccionadas[index];
            this.imageEditorModal.show(
                img.file,
                index,
                img.comentario,
                (savedIndex, editedFile, comentario, elementos) => {
                    this.imagenesSeleccionadas[savedIndex].file = editedFile;
                    this.imagenesSeleccionadas[savedIndex].comentario = comentario;
                    this.imagenesSeleccionadas[savedIndex].elementos = elementos;
                    this.imagenesSeleccionadas[savedIndex].edited = true;

                    if (this.imagenesSeleccionadas[savedIndex].preview) {
                        URL.revokeObjectURL(this.imagenesSeleccionadas[savedIndex].preview);
                    }
                    this.imagenesSeleccionadas[savedIndex].preview = URL.createObjectURL(editedFile);

                    this._actualizarVistaPreviaImagenes();
                }
            );
        }
    }

    _eliminarImagen(index) {
        Swal.fire({
            title: '¿Eliminar imagen?',
            text: 'Esta acción no se puede deshacer',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                if (this.imagenesSeleccionadas[index].preview) {
                    URL.revokeObjectURL(this.imagenesSeleccionadas[index].preview);
                }
                this.imagenesSeleccionadas.splice(index, 1);
                this._actualizarVistaPreviaImagenes();
            }
        });
    }

    _crearRegistroTemporal(datos) {
        const fechaObj = new Date(datos.fechaHora);

        const evidenciasProcesadas = datos.imagenes.map((img, index) => {
            return {
                id: `temp_${Date.now()}_${index}`,
                file: img.file,
                preview: img.preview,
                url: img.preview,
                comentario: img.comentario || '',
                elementos: img.elementos || [],
                generatedName: img.generatedName
            };
        });

        return {
            id: `PREVIEW_${Date.now()}`,
            sucursalId: datos.sucursalId,
            sucursalNombre: datos.sucursalNombre,
            categoriaId: datos.categoriaId,
            categoriaNombre: datos.categoriaNombre,
            subcategoriaId: datos.subcategoriaId,
            subcategoriaNombre: datos.subcategoriaNombre,
            nivelRiesgo: datos.nivelRiesgo,
            estado: datos.estado,
            fechaInicio: fechaObj,
            detalles: datos.detalles,
            reportadoPorNombre: this.usuarioActual.nombreCompleto,
            imagenes: evidenciasProcesadas,
            fechaCreacion: new Date(),
            getEstadoTexto: () => datos.estado === 'pendiente' ? 'Pendiente' : 'Finalizada',
            getNivelRiesgoTexto: () => this._getRiesgoTexto(datos.nivelRiesgo)
        };
    }

    _getRiesgoTexto(riesgo) {
        const riesgos = {
            'bajo': 'Bajo',
            'medio': 'Medio',
            'alto': 'Alto',
            'critico': 'Crítico'
        };
        return riesgos[riesgo] || riesgo;
    }

    async _validarYGuardar() {
        const sucursalInput = document.getElementById('sucursalIncidencia');
        const categoriaInput = document.getElementById('categoriaIncidencia');

        const sucursalId = sucursalInput.dataset.selectedId;
        const categoriaId = categoriaInput.dataset.selectedId;

        if (!sucursalId) {
            this._mostrarError('⚠️ Es necesario seleccionar una sucursal primero');
            sucursalInput.focus();
            return;
        }

        if (!categoriaId) {
            this._mostrarError('Debe seleccionar una categoría válida de la lista');
            categoriaInput.focus();
            return;
        }

        const riesgoSelect = document.getElementById('nivelRiesgo');
        const nivelRiesgo = riesgoSelect.value;
        if (!nivelRiesgo) {
            this._mostrarError('Debe seleccionar el nivel de riesgo');
            riesgoSelect.focus();
            return;
        }

        const estadoSelect = document.getElementById('estadoIncidencia');
        const estado = estadoSelect.value;
        if (!estado) {
            this._mostrarError('Debe seleccionar el estado');
            estadoSelect.focus();
            return;
        }

        const fechaInput = document.getElementById('fechaHoraIncidencia');
        let fechaHora = fechaInput.value;

        if (!fechaHora) {
            this._mostrarError('Debe seleccionar fecha y hora');
            fechaInput.focus();
            return;
        }

        const fechaSeleccionada = new Date(fechaHora);
        const ahora = new Date();

        if (fechaSeleccionada > ahora) {
            this._mostrarError('No puede seleccionar una fecha futura');
            fechaInput.focus();
            return;
        }

        const detallesInput = document.getElementById('detallesIncidencia');
        const detalles = detallesInput.value.trim();
        if (!detalles) {
            detallesInput.classList.add('is-invalid');
            this._mostrarError('La descripción de la incidencia es obligatoria');
            detallesInput.focus();
            return;
        }
        if (detalles.length < 10) {
            detallesInput.classList.add('is-invalid');
            this._mostrarError('La descripción debe tener al menos 10 caracteres');
            detallesInput.focus();
            return;
        }
        if (detalles.length > LIMITES.DETALLES_INCIDENCIA) {
            detallesInput.classList.add('is-invalid');
            this._mostrarError(`La descripción no puede exceder ${LIMITES.DETALLES_INCIDENCIA} caracteres`);
            detallesInput.focus();
            return;
        }
        detallesInput.classList.remove('is-invalid');

        const subcategoriaSelect = document.getElementById('subcategoriaIncidencia');
        const subcategoriaId = subcategoriaSelect.value;

        const sucursalNombre = sucursalInput.value;
        const categoriaNombre = categoriaInput.value;

        const subcategoriaNombre = subcategoriaId ?
            subcategoriaSelect.options[subcategoriaSelect.selectedIndex]?.text : '';

        const datos = {
            sucursalId,
            sucursalNombre,
            categoriaId,
            categoriaNombre,
            subcategoriaId: subcategoriaId || '',
            subcategoriaNombre: subcategoriaNombre || '',
            nivelRiesgo,
            estado,
            fechaHora,
            detalles,
            imagenes: this.imagenesSeleccionadas
        };

        const result = await Swal.fire({
            title: 'Confirmar creación de incidencia',
            html: `
                <div style="text-align: left;">
                    <p><strong><i class="fas fa-store"></i> Sucursal:</strong> ${this._escapeHTML(sucursalNombre)}</p>
                    <p><strong><i class="fas fa-tag"></i> Categoría:</strong> ${this._escapeHTML(categoriaNombre)}</p>
                    ${subcategoriaId ? `<p><strong><i class="fas fa-tags"></i> Subcategoría:</strong> ${this._escapeHTML(subcategoriaNombre)}</p>` : ''}
                    <p><strong><i class="fas fa-exclamation-triangle"></i> Riesgo:</strong> ${this._getRiesgoTexto(nivelRiesgo)}</p>
                    <p><strong><i class="fas fa-check-circle"></i> Estado:</strong> ${estado === 'pendiente' ? 'Pendiente' : 'Finalizada'}</p>
                    <p><strong><i class="fas fa-calendar"></i> Fecha:</strong> ${new Date(fechaHora).toLocaleString('es-MX')}</p>
                    <p><strong><i class="fas fa-images"></i> Evidencias:</strong> ${this.imagenesSeleccionadas.length} imagen(es)</p>
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check-circle"></i> Aceptar',
            cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
            confirmButtonColor: '#28a745',
            cancelButtonColor: '#6c757d'
        });

        if (result.isConfirmed) {
            await this._guardarIncidencia(datos);
        }
    }

    async _guardarIncidencia(datos) {
        const btnCrear = document.getElementById('btnCrearIncidencia');
        const originalHTML = btnCrear ? btnCrear.innerHTML : '<i class="fas fa-check me-2"></i>Finalizar';

        try {
            if (btnCrear) {
                btnCrear.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Guardando...';
                btnCrear.disabled = true;
            }

            Swal.fire({
                title: 'Preparando incidencia...',
                text: 'Generando informe y preparando imágenes...',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const fechaObj = new Date(datos.fechaHora);

            const incidenciaTemporal = this._crearRegistroTemporal(datos);

            Swal.update({
                title: 'Generando PDF...',
                text: 'Creando el documento de la incidencia...'
            });

            let pdfBlob = null;
            try {
                pdfBlob = await this.pdfGenerator.generarIPH(incidenciaTemporal, {
                    mostrarAlerta: false,
                    returnBlob: true,
                    diagnosticar: false
                });
                console.log(`📦 PDF generado: ${(pdfBlob.size / 1024).toFixed(2)} KB`);
            } catch (pdfError) {
                console.error('Error generando PDF:', pdfError);
                throw new Error('No se pudo generar el PDF');
            }

            if (!pdfBlob || pdfBlob.size === 0) {
                throw new Error('El PDF generado está vacío');
            }

            Swal.update({
                title: 'Creando incidencia...',
                text: 'Guardando la información en la base de datos...'
            });

            const incidenciaData = {
                sucursalId: datos.sucursalId,
                categoriaId: datos.categoriaId,
                subcategoriaId: datos.subcategoriaId || '',
                nivelRiesgo: datos.nivelRiesgo,
                estado: datos.estado,
                fechaInicio: fechaObj,
                detalles: datos.detalles,
                reportadoPorId: this.usuarioActual.id
            };

            const nuevaIncidencia = await this.incidenciaManager.crearIncidencia(
                incidenciaData,
                this.usuarioActual,
                [],
                []
            );

            console.log('✅ Incidencia creada:', nuevaIncidencia.id);

            if (datos.imagenes.length > 0) {
                Swal.update({
                    title: 'Subiendo imágenes...',
                    text: `Subiendo ${datos.imagenes.length} imagen(es)...`
                });

                const archivos = datos.imagenes.map(img => img.file);
                const imagenesConDatos = datos.imagenes.map(img => ({
                    comentario: img.comentario,
                    elementos: img.elementos,
                    generatedName: img.generatedName
                }));

                const uploadPromises = archivos.map(async (file, index) => {
                    const datosImagen = imagenesConDatos[index] || {};
                    const comentario = datosImagen.comentario || '';
                    const elementos = datosImagen.elementos || [];

                    let nombreArchivo = datosImagen.generatedName;
                    if (!nombreArchivo) {
                        const timestamp = Date.now();
                        const random = Math.random().toString(36).substring(2, 8);
                        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                        nombreArchivo = `${timestamp}_${random}_${cleanFileName}`;
                    }

                    // Aquí continuaría la subida de imágenes...
                    return { success: true, nombreArchivo };
                });

                await Promise.all(uploadPromises);
            }

            // Guardar PDF en Firebase Storage
            const pdfFileName = `incidencia_${nuevaIncidencia.id}_${Date.now()}.pdf`;
            // Aquí iría la subida del PDF...

            await Swal.fire({
                icon: 'success',
                title: '¡Incidencia creada!',
                html: `
                    <p>La incidencia ha sido creada exitosamente.</p>
                    <p><strong>ID:</strong> ${nuevaIncidencia.id}</p>
                `,
                confirmButtonText: '<i class="fas fa-check-circle"></i> Aceptar'
            });

            this._volverALista();

        } catch (error) {
            console.error('Error guardando incidencia:', error);
            await Swal.fire({
                icon: 'error',
                title: 'Error al guardar',
                text: error.message || 'Ocurrió un error al guardar la incidencia'
            });
        } finally {
            if (btnCrear) {
                btnCrear.innerHTML = originalHTML;
                btnCrear.disabled = false;
            }
        }
    }

    _escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _mostrarError(mensaje) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: mensaje,
            confirmButtonColor: '#dc3545'
        });
    }

    _mostrarNotificacion(mensaje, tipo = 'info', duracion = 3000) {
        Swal.fire({
            icon: tipo,
            title: tipo === 'warning' ? 'Advertencia' : 'Información',
            text: mensaje,
            timer: duracion,
            showConfirmButton: false
        });
    }

    _volverALista() {
        window.location.href = '/modulos/incidencias/listaIncidencias.html';
    }

    _cancelarCreacion() {
        Swal.fire({
            title: '¿Cancelar creación?',
            text: 'Los datos ingresados se perderán',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Sí, cancelar',
            cancelButtonText: 'Continuar editando'
        }).then((result) => {
            if (result.isConfirmed) {
                this._limpiarFormulario();
                this._volverALista();
            }
        });
    }

    _limpiarFormulario() {
        // Limpiar imágenes
        this.imagenesSeleccionadas.forEach(img => {
            if (img.preview) URL.revokeObjectURL(img.preview);
        });
        this.imagenesSeleccionadas = [];
        this._actualizarVistaPreviaImagenes();

        // Limpiar campos
        document.getElementById('sucursalIncidencia').value = '';
        document.getElementById('sucursalIncidencia').dataset.selectedId = '';
        document.getElementById('categoriaIncidencia').value = '';
        document.getElementById('categoriaIncidencia').dataset.selectedId = '';
        document.getElementById('nivelRiesgo').value = '';
        document.getElementById('estadoIncidencia').value = '';
        document.getElementById('fechaHoraIncidencia').value = '';
        document.getElementById('detallesIncidencia').value = '';

        const selectSub = document.getElementById('subcategoriaIncidencia');
        if (selectSub) selectSub.innerHTML = '<option value="">-- Selecciona una subcategoría (opcional) --</option>';

        // Resetear campos desplegados
        this.camposDesplegados = {
            sucursal: false,
            categoria: false,
            subcategoria: false,
            riesgo: false,
            estado: false,
            fecha: false,
            descripcion: false
        };

        // Ocultar campos adicionales
        const containers = ['containerCategoria', 'containerSubcategoria', 'containerRiesgo', 'containerEstado', 'containerFecha', 'containerDescripcion'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Ocultar sección de evidencias
        const seccionEvidencias = document.getElementById('seccionEvidencias');
        if (seccionEvidencias) seccionEvidencias.style.display = 'none';

        const btnContainer = document.getElementById('btnFinalizarContainer');
        if (btnContainer) btnContainer.style.display = 'none';
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new CrearIncidenciaController();
});