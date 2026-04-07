// crearIncidencias.js - VERSIÓN CORREGIDA
// - Extensión dinámica funcionando
// - Sección de evidencias OCULTA hasta completar TODOS los campos
// - Arrastrar imágenes habilitado
// - Ctrl+V funcionando

const LIMITES = {
    DETALLES_INCIDENCIA: 1000
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
        this.sucursalesParaNotificar = [];
        this.areasParaNotificar = [];
        this.AreaManager = null;
        this.notificacionManager = null;
        this.notificacionSucursalManager = null;

        this.pdfGenerator = null;
        this.pasoActual = 0;
        this.totalPasos = 7;

        this._init();
    }

    // =============================================
    // VERIFICAR SI TODOS LOS CAMPOS ESTÁN COMPLETOS
    // =============================================
    _verificarTodosLosCamposCompletos() {
        // Verificar sucursal
        const sucursalInput = document.getElementById('sucursalIncidencia');
        const sucursalValida = sucursalInput?.dataset?.selectedId && sucursalInput.dataset.selectedId !== '';

        // Verificar categoría
        const categoriaInput = document.getElementById('categoriaIncidencia');
        const categoriaValida = categoriaInput?.dataset?.selectedId && categoriaInput.dataset.selectedId !== '';

        // Verificar nivel de riesgo
        const nivelRiesgo = document.getElementById('nivelRiesgo')?.value;
        const riesgoValido = nivelRiesgo && nivelRiesgo !== '';

        // Verificar estado
        const estado = document.getElementById('estadoIncidencia')?.value;
        const estadoValido = estado !== null && estado !== undefined && estado !== '';

        // Verificar fecha
        const fecha = document.getElementById('fechaHoraIncidencia')?.value;
        let fechaValida = false;
        if (fecha) {
            const fechaObj = new Date(fecha);
            fechaValida = !isNaN(fechaObj.getTime()) && fechaObj <= new Date();
        }

        // Verificar descripción
        const detalles = document.getElementById('detallesIncidencia')?.value.trim();
        const detallesValidos = detalles.length >= 10 && detalles.length <= LIMITES.DETALLES_INCIDENCIA;

        const todosCompletos = sucursalValida && categoriaValida && riesgoValido &&
            estadoValido && fechaValida && detallesValidos;

        const seccionImagenes = document.getElementById('seccionImagenesWrapper');
        if (seccionImagenes) {
            if (todosCompletos) {
                seccionImagenes.classList.add('visible');
            } else {
                seccionImagenes.classList.remove('visible');
            }
        }

        return todosCompletos;
    }

    // =============================================
    // CONFIGURAR ARRASTRE DE IMÁGENES
    // =============================================
    _configurarArrastreImagenes() {
        const dropZone = document.getElementById('dropZoneImagenes');

        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
                if (imageFiles.length > 0) {
                    this._procesarImagenes(imageFiles);
                    this._mostrarNotificacion(`${imageFiles.length} imagen(es) arrastradas`, 'success', 2000);
                } else {
                    this._mostrarNotificacion('Solo se permiten archivos de imagen', 'warning', 2000);
                }
            }
        });

        dropZone.addEventListener('click', () => {
            document.getElementById('inputImagenes').click();
        });
    }

    // =============================================
    // Pegar imágenes con Ctrl+V
    // =============================================
    _configurarPegarImagenes() {
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            const imageFiles = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) {
                        const timestamp = Date.now();
                        const random = Math.random().toString(36).substring(2, 8);
                        const extension = file.type.split('/')[1] || 'png';
                        imageFiles.push(new File([file], `pegado_${timestamp}_${random}.${extension}`, { type: file.type }));
                    }
                }
            }
            if (imageFiles.length > 0) {
                e.preventDefault();
                this._procesarImagenes(imageFiles);
                this._mostrarNotificacion(`${imageFiles.length} imagen(es) pegadas desde portapapeles`, 'success', 2000);
            }
        });
    }

    // =============================================
    // VALIDACIÓN SECUENCIAL
    // =============================================
    _configurarValidacionSecuencial() {
        // Ocultar todos los steps inicialmente
        document.querySelectorAll('.field-group-step').forEach(step => {
            step.classList.remove('visible');
        });

        // Mostrar solo el primer paso
        const primerStep = document.querySelector('.field-group-step[data-step="0"]');
        if (primerStep) primerStep.classList.add('visible');

        // Ocultar sección de evidencias inicialmente
        const seccionImagenes = document.getElementById('seccionImagenesWrapper');
        if (seccionImagenes) {
            seccionImagenes.classList.remove('visible');
        }

        // Definir el orden de los campos y sus validaciones
        const ordenCampos = [
            {
                id: 'sucursalIncidencia',
                siguiente: 'categoriaIncidencia',
                validar: (valor) => {
                    const input = document.getElementById('sucursalIncidencia');
                    return input?.dataset?.selectedId && input.dataset.selectedId !== '';
                }
            },
            {
                id: 'categoriaIncidencia',
                siguiente: 'subcategoriaIncidencia',
                validar: (valor) => {
                    const input = document.getElementById('categoriaIncidencia');
                    return input?.dataset?.selectedId && input.dataset.selectedId !== '';
                }
            },
            {
                id: 'subcategoriaIncidencia',
                siguiente: 'nivelRiesgo',
                validar: (valor) => true
            },
            {
                id: 'nivelRiesgo',
                siguiente: 'estadoIncidencia',
                validar: (valor) => valor !== '' && valor !== null
            },
            {
                id: 'estadoIncidencia',
                siguiente: 'fechaHoraIncidencia',
                validar: (valor) => valor !== '' && valor !== null
            },
            {
                id: 'fechaHoraIncidencia',
                siguiente: 'detallesIncidencia',
                validar: (valor) => {
                    if (!valor) return false;
                    const fechaObj = new Date(valor);
                    return !isNaN(fechaObj.getTime()) && fechaObj <= new Date();
                }
            },
            {
                id: 'detallesIncidencia',
                siguiente: null,
                validar: (valor) => {
                    const texto = valor.trim();
                    return texto.length >= 10 && texto.length <= LIMITES.DETALLES_INCIDENCIA;
                }
            }
        ];

        // Configurar cada campo
        ordenCampos.forEach((campo, index) => {
            const elemento = document.getElementById(campo.id);
            if (!elemento) return;

            elemento._validacionSecuencial = {
                siguienteId: campo.siguiente,
                validar: campo.validar,
                indice: index
            };

            if (index === 0) {
                this._habilitarCampo(elemento);
            } else {
                this._deshabilitarCampo(elemento);
            }

            elemento.addEventListener('change', () => {
                this._validarYHabilitarSiguiente(campo.id);
                this._verificarTodosLosCamposCompletos(); // Verificar todos los campos después de cada cambio
            });

            if (elemento.tagName === 'INPUT' || elemento.tagName === 'TEXTAREA') {
                elemento.addEventListener('blur', () => {
                    this._validarYHabilitarSiguiente(campo.id);
                    this._verificarTodosLosCamposCompletos();
                });
            }

            // Para selects, también verificar al cambiar
            if (elemento.tagName === 'SELECT') {
                elemento.addEventListener('change', () => {
                    this._verificarTodosLosCamposCompletos();
                });
            }
        });

        // Configuración especial para Flatpickr
        const fechaInput = document.getElementById('fechaHoraIncidencia');
        if (fechaInput && this.flatpickrInstance) {
            this.flatpickrInstance.config.onClose = (selectedDates, dateStr, instance) => {
                if (selectedDates.length > 0) {
                    this._validarYHabilitarSiguiente('fechaHoraIncidencia');
                    this._verificarTodosLosCamposCompletos();
                }
            };
        }

        // Observers para sugerencias
        const sucursalInput = document.getElementById('sucursalIncidencia');
        if (sucursalInput) {
            const observer = new MutationObserver(() => {
                this._validarYHabilitarSiguiente('sucursalIncidencia');
                this._verificarTodosLosCamposCompletos();
            });
            observer.observe(sucursalInput, { attributes: true, attributeFilter: ['data-selected-id'] });
        }

        const categoriaInput = document.getElementById('categoriaIncidencia');
        if (categoriaInput) {
            const observer = new MutationObserver(() => {
                this._validarYHabilitarSiguiente('categoriaIncidencia');
                this._verificarTodosLosCamposCompletos();
            });
            observer.observe(categoriaInput, { attributes: true, attributeFilter: ['data-selected-id'] });
        }

        // Escuchar cambios en detalles (textarea)
        const detallesInput = document.getElementById('detallesIncidencia');
        if (detallesInput) {
            detallesInput.addEventListener('input', () => {
                this._verificarTodosLosCamposCompletos();
            });
        }
    }

    _habilitarCampo(elemento) {
        if (!elemento) return;
        elemento.disabled = false;

        if (elemento.tagName === 'SELECT') {
            elemento.disabled = false;
        }

        if (elemento.tagName === 'INPUT') {
            elemento.readOnly = false;
        }

        if (elemento.tagName === 'TEXTAREA') {
            elemento.readOnly = false;
        }

        const parent = elemento.closest('.field-group-step');
        if (parent) {
            parent.classList.remove('locked');
        }
    }

    _deshabilitarCampo(elemento) {
        if (!elemento) return;
        elemento.disabled = true;

        if (elemento.tagName === 'SELECT') {
            elemento.disabled = true;
        }

        if (elemento.tagName === 'INPUT') {
            elemento.readOnly = true;
        }

        if (elemento.tagName === 'TEXTAREA') {
            elemento.readOnly = true;
        }

        const parent = elemento.closest('.field-group-step');
        if (parent) {
            parent.classList.add('locked');
        }
    }

    _validarYHabilitarSiguiente(campoId) {
        const campo = document.getElementById(campoId);
        if (!campo) return;

        const config = campo._validacionSecuencial;
        if (!config) return;

        let valor = campo.value;

        if (campoId === 'sucursalIncidencia') {
            const input = document.getElementById('sucursalIncidencia');
            valor = input?.dataset?.selectedId || '';
        }

        if (campoId === 'categoriaIncidencia') {
            const input = document.getElementById('categoriaIncidencia');
            valor = input?.dataset?.selectedId || '';
        }

        const esValido = config.validar(valor);

        if (!esValido && valor !== '' && valor !== null) {
            campo.classList.add('field-error-shake');
            setTimeout(() => campo.classList.remove('field-error-shake'), 500);
        }

        if (esValido && config.siguienteId) {
            const siguienteCampo = document.getElementById(config.siguienteId);
            if (siguienteCampo && siguienteCampo.disabled) {
                this._habilitarCampo(siguienteCampo);

                const siguienteStep = document.querySelector(`.field-group-step[data-step="${config.indice + 1}"]`);
                if (siguienteStep && !siguienteStep.classList.contains('visible')) {
                    siguienteStep.classList.add('visible');

                    setTimeout(() => {
                        siguienteCampo.focus();
                    }, 100);
                }
            }
        }

        if (!esValido && config.siguienteId) {
            this._deshabilitarCamposSiguientes(config.siguienteId);
        }
    }

    _deshabilitarCamposSiguientes(campoId) {
        const ordenCampos = [
            'sucursalIncidencia',
            'categoriaIncidencia',
            'subcategoriaIncidencia',
            'nivelRiesgo',
            'estadoIncidencia',
            'fechaHoraIncidencia',
            'detallesIncidencia'
        ];

        const indiceActual = ordenCampos.indexOf(campoId);
        if (indiceActual === -1) return;

        for (let i = indiceActual; i < ordenCampos.length; i++) {
            const campo = document.getElementById(ordenCampos[i]);
            if (campo && !campo.disabled && i !== 0) {
                this._deshabilitarCampo(campo);
            }
        }
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

    async _initNotificacionSucursalManager() {
        if (!this.notificacionSucursalManager) {
            try {
                const { NotificacionSucursalManager } = await import('/clases/notificacionSucursal.js');
                this.notificacionSucursalManager = new NotificacionSucursalManager();
            } catch (error) {
                console.error('Error inicializando notificacionSucursalManager:', error);
            }
        }
        return this.notificacionSucursalManager;
    }

    async _initPDFGenerator() {
        if (!this.pdfGenerator) {
            try {
                const { generadorIPH } = await import('/components/iph-generator.js');
                this.pdfGenerator = generadorIPH;

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
            await this._cargarSucursalesParaNotificacion();
            await this._initNotificacionManager();
            await this._initNotificacionSucursalManager();

            await this._initPDFGenerator();

            this._configurarOrganizacion();
            this._inicializarDateTimePicker();
            this._configurarEventos();
            this._inicializarValidaciones();
            this._configurarValidacionSecuencial();
            this._configurarArrastreImagenes();
            this._configurarPegarImagenes();

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
                    disableMobile: true
                });
            } catch (error) {
                console.error('Error inicializando Flatpickr:', error);
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
            }
        } catch (error) {
            console.error('Error cargando áreas:', error);
            this.areas = [];
        }
    }

    async _cargarSucursalesParaNotificacion() {
        try {
            const { SucursalManager } = await import('/clases/sucursal.js');
            const sucursalManager = new SucursalManager();
            this.sucursalesParaNotificar = await sucursalManager.getSucursalesByOrganizacion(
                this.usuarioActual.organizacionCamelCase
            );
        } catch (error) {
            console.error('Error cargando sucursales:', error);
            this.sucursalesParaNotificar = [];
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
                this._validarLongitudCampo(detallesInput, LIMITES.DETALLES_INCIDENCIA, 'Los detalles');
                this._actualizarContador('detallesIncidencia', 'contadorCaracteres', LIMITES.DETALLES_INCIDENCIA);
            });
        }
        this._actualizarContador('detallesIncidencia', 'contadorCaracteres', LIMITES.DETALLES_INCIDENCIA);
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
            document.getElementById('btnCrearIncidencia')?.addEventListener('click', (e) => {
                e.preventDefault();
                this._validarYGuardar();
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
        const contenedorSucursal = document.getElementById('sugerenciasSucursal');
        const contenedorCategoria = document.getElementById('sugerenciasCategoria');

        if (inputSucursal && contenedorSucursal) {
            inputSucursal.addEventListener('input', (e) => this._mostrarSugerenciasSucursal(e.target.value));
            inputSucursal.addEventListener('blur', () => {
                setTimeout(() => {
                    contenedorSucursal.style.display = 'none';
                }, 200);
            });
            inputSucursal.addEventListener('focus', (e) => {
                if (e.target.value.length > 0) {
                    contenedorSucursal.style.display = 'block';
                    this._mostrarSugerenciasSucursal(e.target.value);
                }
            });
        }

        if (inputCategoria && contenedorCategoria) {
            inputCategoria.addEventListener('input', (e) => this._mostrarSugerenciasCategoria(e.target.value));
            inputCategoria.addEventListener('blur', () => {
                setTimeout(() => {
                    contenedorCategoria.style.display = 'none';
                }, 200);
            });
            inputCategoria.addEventListener('focus', (e) => {
                if (e.target.value.length > 0) {
                    contenedorCategoria.style.display = 'block';
                    this._mostrarSugerenciasCategoria(e.target.value);
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (inputSucursal && !inputSucursal.contains(e.target) && contenedorSucursal) {
                contenedorSucursal.style.display = 'none';
            }
            if (inputCategoria && !inputCategoria.contains(e.target) && contenedorCategoria) {
                contenedorCategoria.style.display = 'none';
            }
        });
    }

    _mostrarSugerenciasSucursal(termino) {
        const contenedor = document.getElementById('sugerenciasSucursal');
        if (!contenedor) return;

        const terminoLower = termino.toLowerCase().trim();
        if (terminoLower.length === 0) {
            contenedor.style.display = 'none';
            contenedor.innerHTML = '';
            return;
        }

        const sugerencias = this.sucursales.filter(suc =>
            suc.nombre.toLowerCase().includes(terminoLower)
        ).slice(0, 8);

        if (sugerencias.length === 0) {
            contenedor.innerHTML = `<div class="sugerencia-vacia"><i class="fas fa-store"></i><p>No se encontraron sucursales</p></div>`;
            contenedor.style.display = 'block';
            return;
        }

        let html = '<div class="sugerencias-lista">';
        sugerencias.forEach(suc => {
            html += `<div class="sugerencia-item" data-id="${suc.id}" data-nombre="${this._escapeHTML(suc.nombre)}">
                        <div class="sugerencia-icono"><i class="fas fa-store"></i></div>
                        <div class="sugerencia-info">
                            <div class="sugerencia-nombre">${this._escapeHTML(suc.nombre)}</div>
                            <div class="sugerencia-detalle"><i class="fas fa-map-marker-alt"></i> ${suc.ciudad || 'Sin ciudad'}</div>
                        </div>
                    </div>`;
        });
        html += '</div>';
        contenedor.innerHTML = html;
        contenedor.style.display = 'block';

        contenedor.querySelectorAll('.sugerencia-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = item.dataset.id;
                const nombre = item.dataset.nombre;
                this._seleccionarSucursal(id, nombre);
                contenedor.style.display = 'none';
            });
        });
    }

    _mostrarSugerenciasCategoria(termino) {
        const contenedor = document.getElementById('sugerenciasCategoria');
        if (!contenedor) return;

        const terminoLower = termino.toLowerCase().trim();
        if (terminoLower.length === 0) {
            contenedor.style.display = 'none';
            contenedor.innerHTML = '';
            return;
        }

        const sugerencias = this.categorias.filter(cat =>
            cat.nombre.toLowerCase().includes(terminoLower)
        ).slice(0, 8);

        if (sugerencias.length === 0) {
            contenedor.innerHTML = `<div class="sugerencia-vacia"><i class="fas fa-tags"></i><p>No se encontraron categorías</p></div>`;
            contenedor.style.display = 'block';
            return;
        }

        let html = '<div class="sugerencias-lista">';
        sugerencias.forEach(cat => {
            html += `<div class="sugerencia-item" data-id="${cat.id}" data-nombre="${this._escapeHTML(cat.nombre)}">
                        <div class="sugerencia-icono"><i class="fas fa-tag"></i></div>
                        <div class="sugerencia-info">
                            <div class="sugerencia-nombre">${this._escapeHTML(cat.nombre)}</div>
                        </div>
                    </div>`;
        });
        html += '</div>';
        contenedor.innerHTML = html;
        contenedor.style.display = 'block';

        contenedor.querySelectorAll('.sugerencia-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = item.dataset.id;
                const nombre = item.dataset.nombre;
                this._seleccionarCategoria(id, nombre);
                contenedor.style.display = 'none';
            });
        });
    }

    _seleccionarSucursal(id, nombre) {
        const input = document.getElementById('sucursalIncidencia');
        input.value = nombre;
        input.dataset.selectedId = id;
        input.dataset.selectedName = nombre;
        this._validarYHabilitarSiguiente('sucursalIncidencia');
        this._verificarTodosLosCamposCompletos();
    }

    _seleccionarCategoria(id, nombre) {
        const input = document.getElementById('categoriaIncidencia');
        input.value = nombre;
        input.dataset.selectedId = id;
        input.dataset.selectedName = nombre;
        this._cargarSubcategorias(id);
        this._validarYHabilitarSiguiente('categoriaIncidencia');
        this._verificarTodosLosCamposCompletos();
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
                            subcategoriasArray.push({ id: clave, nombre: valor.nombre || clave });
                        }
                    });
                } else if (typeof categoria.subcategorias === 'object') {
                    subcategoriasArray = Object.keys(categoria.subcategorias).map(key => ({
                        id: key,
                        nombre: categoria.subcategorias[key]?.nombre || key
                    }));
                }
            }
            if (subcategoriasArray.length === 0) {
                selectSubcategoria.innerHTML = '<option value="">-- No hay subcategorías disponibles --</option>';
                selectSubcategoria.disabled = true;
                return;
            }
            let options = '<option value="">-- Selecciona una subcategoría (opcional) --</option>';
            subcategoriasArray.forEach(sub => {
                options += `<option value="${sub.id}">${sub.nombre || sub.id}</option>`;
            });
            selectSubcategoria.innerHTML = options;
            selectSubcategoria.disabled = false;
        } catch (error) {
            console.error('Error cargando subcategorías:', error);
            selectSubcategoria.innerHTML = '<option value="">-- Error cargando subcategorías --</option>';
            selectSubcategoria.disabled = true;
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
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
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
        const inputImagenes = document.getElementById('inputImagenes');
        if (inputImagenes) inputImagenes.value = '';
    }

    _actualizarVistaPreviaImagenes() {
        const container = document.getElementById('imagenesPreview');
        const countSpan = document.getElementById('imagenesCount');
        if (!container) return;
        if (countSpan) countSpan.textContent = this.imagenesSeleccionadas.length;
        if (this.imagenesSeleccionadas.length === 0) {
            container.innerHTML = `<div class="no-images"><i class="fas fa-images"></i><p>No hay evidencias seleccionadas</p></div>`;
            return;
        }
        let html = '';
        this.imagenesSeleccionadas.forEach((img, index) => {
            html += `<div class="preview-item">
                        <img src="${img.preview}" alt="Evidencia ${index + 1}">
                        <div class="preview-overlay">
                            <button type="button" class="preview-btn edit-btn" data-index="${index}" title="Editar"><i class="fas fa-edit"></i></button>
                            <button type="button" class="preview-btn delete-btn" data-index="${index}" title="Eliminar"><i class="fas fa-trash"></i></button>
                            ${img.edited ? '<span class="edited-badge"><i class="fas fa-check"></i> Editada</span>' : ''}
                        </div>
                        ${img.comentario ? `<div class="image-comment"><i class="fas fa-comment"></i> ${this._escapeHTML(img.comentario.substring(0, 30))}${img.comentario.length > 30 ? '...' : ''}</div>` : ''}
                    </div>`;
        });
        container.innerHTML = html;
        container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._editarImagen(parseInt(e.currentTarget.dataset.index)));
        });
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._eliminarImagen(parseInt(e.currentTarget.dataset.index)));
        });
    }

    _editarImagen(index) {
        if (this.imageEditorModal && this.imagenesSeleccionadas[index]) {
            const img = this.imagenesSeleccionadas[index];
            this.imageEditorModal.show(img.file, index, img.comentario, (savedIndex, editedFile, comentario, elementos) => {
                this.imagenesSeleccionadas[savedIndex].file = editedFile;
                this.imagenesSeleccionadas[savedIndex].comentario = comentario;
                this.imagenesSeleccionadas[savedIndex].elementos = elementos;
                this.imagenesSeleccionadas[savedIndex].edited = true;
                if (this.imagenesSeleccionadas[savedIndex].preview) {
                    URL.revokeObjectURL(this.imagenesSeleccionadas[savedIndex].preview);
                }
                this.imagenesSeleccionadas[savedIndex].preview = URL.createObjectURL(editedFile);
                this._actualizarVistaPreviaImagenes();
            });
        }
    }

    _eliminarImagen(index) {
        Swal.fire({
            title: '¿Eliminar evidencia?',
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
        const evidenciasProcesadas = datos.imagenes.map((img, index) => ({
            id: `temp_${Date.now()}_${index}`,
            file: img.file,
            preview: img.preview,
            url: img.preview,
            comentario: img.comentario || '',
            elementos: img.elementos || [],
            generatedName: img.generatedName
        }));
        return {
            id: `INC_${Date.now()}`,
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
        const riesgos = { 'bajo': 'Bajo', 'medio': 'Medio', 'alto': 'Alto', 'critico': 'Crítico' };
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
            this._mostrarError('La descripción de la incidencia es obligatoria');
            detallesInput.focus();
            return;
        }
        if (detalles.length < 10) {
            this._mostrarError('La descripción debe tener al menos 10 caracteres');
            detallesInput.focus();
            return;
        }
        if (detalles.length > LIMITES.DETALLES_INCIDENCIA) {
            this._mostrarError(`La descripción no puede exceder ${LIMITES.DETALLES_INCIDENCIA} caracteres`);
            detallesInput.focus();
            return;
        }
        const subcategoriaSelect = document.getElementById('subcategoriaIncidencia');
        const subcategoriaId = subcategoriaSelect.value;
        const sucursalNombre = sucursalInput.value;
        const categoriaNombre = categoriaInput.value;
        const subcategoriaNombre = subcategoriaId ? subcategoriaSelect.options[subcategoriaSelect.selectedIndex]?.text : '';

        const datos = {
            sucursalId, sucursalNombre, categoriaId, categoriaNombre,
            subcategoriaId: subcategoriaId || '', subcategoriaNombre: subcategoriaNombre || '',
            nivelRiesgo, estado, fechaHora, detalles, imagenes: this.imagenesSeleccionadas
        };

        const result = await Swal.fire({
            title: 'Confirmar creación de incidencia',
            html: `<div style="text-align: left;">
                        <p><strong>Sucursal:</strong> ${this._escapeHTML(sucursalNombre)}</p>
                        <p><strong>Categoría:</strong> ${this._escapeHTML(categoriaNombre)}</p>
                        ${subcategoriaId ? `<p><strong>Subcategoría:</strong> ${this._escapeHTML(subcategoriaNombre)}</p>` : ''}
                        <p><strong>Riesgo:</strong> ${this._getRiesgoTexto(nivelRiesgo)}</p>
                        <p><strong>Estado:</strong> ${estado === 'pendiente' ? 'Pendiente' : 'Finalizada'}</p>
                        <p><strong>Fecha:</strong> ${new Date(fechaHora).toLocaleString('es-MX')}</p>
                        <p><strong>Evidencias:</strong> ${this.imagenesSeleccionadas.length} imagen(es)</p>
                    </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save"></i> Crear',
            cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
            confirmButtonColor: '#28a745'
        });

        if (result.isConfirmed) {
            Swal.fire({ title: 'Generando PDF...', text: 'Preparando el documento...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
            const incidenciaTemporal = this._crearRegistroTemporal(datos);
            try {
                const pdfBlob = await this.pdfGenerator.generarIPH(incidenciaTemporal, { mostrarAlerta: false, returnBlob: true });
                const pdfUrl = URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = pdfUrl;
                link.download = `incidencia_${datos.sucursalNombre}_${Date.now()}.pdf`;
                link.click();
                URL.revokeObjectURL(pdfUrl);
                Swal.close();
            } catch (pdfError) {
                console.error('Error generando PDF:', pdfError);
                Swal.close();
            }
            await this._guardarIncidencia(datos);
        }
    }

    async _guardarIncidencia(datos) {
        const btnCrear = document.getElementById('btnCrearIncidencia');
        const originalHTML = btnCrear?.innerHTML || 'Crear Incidencia';
        try {
            if (btnCrear) {
                btnCrear.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Guardando...';
                btnCrear.disabled = true;
            }
            Swal.fire({ title: 'Guardando...', text: 'Creando incidencia...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
            const fechaObj = new Date(datos.fechaHora);
            const incidenciaData = {
                sucursalId: datos.sucursalId, categoriaId: datos.categoriaId, subcategoriaId: datos.subcategoriaId || '',
                nivelRiesgo: datos.nivelRiesgo, estado: datos.estado, fechaInicio: fechaObj,
                detalles: datos.detalles, reportadoPorId: this.usuarioActual.id
            };
            const nuevaIncidencia = await this.incidenciaManager.crearIncidencia(incidenciaData, this.usuarioActual, [], []);
            if (datos.imagenes.length > 0) {
                Swal.update({ title: 'Subiendo imágenes...', text: `Subiendo ${datos.imagenes.length} imagen(es)...` });
                const uploadPromises = datos.imagenes.map(async (img, index) => {
                    const nombreArchivo = img.generatedName || `${Date.now()}_${index}_${img.file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                    const rutaStorage = `incidencias_${this.usuarioActual.organizacionCamelCase}/${nuevaIncidencia.id}/imagenes/${nombreArchivo}`;
                    const resultado = await this.incidenciaManager.subirArchivo(img.file, rutaStorage, null);
                    return { url: resultado.url, path: resultado.path, comentario: img.comentario || '', elementos: img.elementos || [], nombre: img.file.name, generatedName: nombreArchivo };
                });
                const imagenesSubidas = await Promise.all(uploadPromises);
                const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
                const { db } = await import('/config/firebase-config.js');
                const collectionName = `incidencias_${this.usuarioActual.organizacionCamelCase}`;
                await updateDoc(doc(db, collectionName, nuevaIncidencia.id), { imagenes: imagenesSubidas, fechaActualizacion: new Date() });
            }
            Swal.close();

            const quiereCanalizarSucursal = await Swal.fire({ icon: 'question', title: '¿Canalizar a la sucursal?', text: '¿Deseas canalizar esta incidencia a la sucursal seleccionada?', showCancelButton: true, confirmButtonText: 'SÍ', cancelButtonText: 'NO' });
            if (quiereCanalizarSucursal.isConfirmed) {
                await this._canalizarSucursal(nuevaIncidencia.id, datos.detalles.substring(0, 50));
            }
            const quiereCanalizarArea = await Swal.fire({ icon: 'question', title: '¿Canalizar a área(s)?', text: '¿Deseas canalizar esta incidencia a alguna área?', showCancelButton: true, confirmButtonText: 'SÍ', cancelButtonText: 'NO' });
            if (quiereCanalizarArea.isConfirmed && this.areas.length > 0) {
                await this._canalizarAreas(nuevaIncidencia.id, datos.detalles.substring(0, 50));
            }

            await Swal.fire({ icon: 'success', title: '¡Incidencia creada!', text: 'La incidencia se ha creado correctamente', confirmButtonColor: '#28a745' });
            this._volverALista();
        } catch (error) {
            console.error('Error guardando incidencia:', error);
            Swal.close();
            this._mostrarError(error.message || 'No se pudo crear la incidencia');
        } finally {
            if (btnCrear) {
                btnCrear.innerHTML = originalHTML;
                btnCrear.disabled = false;
            }
        }
    }

    async _canalizarSucursal(incidenciaId, incidenciaTitulo = '') {
        const sucursalInput = document.getElementById('sucursalIncidencia');
        const sucursalId = sucursalInput?.dataset.selectedId;
        const sucursalNombre = sucursalInput?.value;
        if (!sucursalId) return null;
        try {
            await this.incidenciaManager.agregarCanalizacionSucursal(incidenciaId, sucursalId, sucursalNombre, this.usuarioActual.id, this.usuarioActual.nombreCompleto, 'Canalización desde creación', this.usuarioActual.organizacionCamelCase);
            return { id: sucursalId, nombre: sucursalNombre };
        } catch (error) {
            console.error('Error canalizando sucursal:', error);
            return null;
        }
    }

    async _canalizarAreas(incidenciaId, incidenciaTitulo = '') {
        let continuar = true;
        let areasCanalizadas = [];
        while (continuar && this.areas.length > 0) {
            const { value: areaId, isConfirmed } = await Swal.fire({
                title: areasCanalizadas.length === 0 ? 'Canalizar a un área' : 'Canalizar a otra área',
                input: 'select',
                inputOptions: this.areas.reduce((opts, area) => {
                    if (!areasCanalizadas.some(a => a.id === area.id)) opts[area.id] = area.nombreArea;
                    return opts;
                }, {}),
                showCancelButton: true,
                confirmButtonText: 'CANALIZAR',
                cancelButtonText: areasCanalizadas.length === 0 ? 'SALTAR' : 'FINALIZAR'
            });
            if (!isConfirmed) {
                continuar = false;
                break;
            }
            if (areaId) {
                const area = this.areas.find(a => a.id === areaId);
                if (area) {
                    areasCanalizadas.push({ id: area.id, nombre: area.nombreArea });
                    await this.incidenciaManager.agregarCanalizacion(incidenciaId, area.id, area.nombreArea, this.usuarioActual.id, this.usuarioActual.nombreCompleto, 'Canalización desde creación', this.usuarioActual.organizacionCamelCase);
                    await Swal.fire({ icon: 'success', title: 'Área agregada', text: `Canalizada a ${area.nombreArea}`, timer: 1500, showConfirmButton: false });
                }
            }
        }
        return areasCanalizadas;
    }

    _volverALista() {
        this.imagenesSeleccionadas.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview); });
        window.location.href = '../incidencias/incidencias.html';
    }

    _cancelarCreacion() {
        Swal.fire({
            title: '¿Cancelar?',
            text: 'Los cambios no guardados se perderán',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, cancelar',
            cancelButtonText: 'No, continuar'
        }).then((result) => {
            if (result.isConfirmed) {
                this.imagenesSeleccionadas.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview); });
                this._volverALista();
            }
        });
    }

    _mostrarError(mensaje) { this._mostrarNotificacion(mensaje, 'error'); }
    _mostrarNotificacion(mensaje, tipo = 'info', duracion = 5000) {
        Swal.fire({ title: tipo === 'success' ? 'Éxito' : tipo === 'error' ? 'Error' : tipo === 'warning' ? 'Advertencia' : 'Información', text: mensaje, icon: tipo, timer: duracion, timerProgressBar: true, showConfirmButton: false });
    }
    _escapeHTML(text) { if (!text) return ''; return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
}

document.addEventListener('DOMContentLoaded', () => {
    window.crearIncidenciaDebug = { controller: new CrearIncidenciaController() };
});