// crearIncidencias.js - VERSIÓN COMPLETA (CORREGIDA Y CON AUTOCOMPLETADO)
// ✅ Canalizaciones a áreas y sucursales
// ✅ Notificaciones push
// ✅ Compartir PDF (WhatsApp, Email, Link)
// ✅ Riesgo automático desde subcategoría
// ✅ Drag & drop de imágenes
// ✅ Fecha/Hora con flatpickr (Tiempo Real e Histórico)
// ✅ Formulario ACUMULATIVO
// ✅ AUTOCOMPLETADO PREDICTIVO con <auto-descripcion>
// ✅ Sin recursión infinita en niveles de riesgo

const LIMITES = {
    DETALLES_INCIDENCIA: 1000
};

class CrearIncidenciaController {
    constructor() {
        this.incidenciaManager = null;
        this.usuarioActual = null;
        this.sucursales = [];
        this.categorias = [];
        this.categoriasOriginales = [];
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
        this.riesgoManager = null;
        this.nivelesRiesgo = [];
        this.nivelesRiesgoMap = new Map();
        this.nivelesRiesgoOptions = [];
        this.categoriaManager = null;
        this.riesgoSeleccionadoId = null;
        this.fechaHoraTiempoRealFija = null;
        this.tipoEventoSeleccionado = null;
        this.descripcionComponent = null;
        
        // BANDERA PARA EVITAR RECURSIÓN EN RIESGOS
        this.actualizandoRiesgo = false;

        this._init();
    }

    // ==================== INICIALIZACIÓN DE MANAGERS ====================
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

    async _initRiesgoManager() {
        if (!this.riesgoManager) {
            try {
                const { RiesgoNivelManager } = await import('/clases/riesgoNivel.js');
                this.riesgoManager = new RiesgoNivelManager();
                if (this.usuarioActual && this.usuarioActual.organizacionCamelCase) {
                    this.nivelesRiesgo = await this.riesgoManager.obtenerTodosNiveles(
                        this.usuarioActual.organizacionCamelCase
                    );
                    this.nivelesRiesgoMap.clear();
                    this.nivelesRiesgo.forEach(nivel => {
                        this.nivelesRiesgoMap.set(nivel.id, {
                            nombre: nivel.nombre,
                            color: nivel.color
                        });
                    });
                }
            } catch (error) {
                console.error('Error inicializando riesgoManager:', error);
                this.riesgoManager = null;
                this.nivelesRiesgo = [];
            }
        }
        return this.riesgoManager;
    }

    async _initCategoriaManager() {
        if (!this.categoriaManager) {
            try {
                const { CategoriaManager } = await import('/clases/categoria.js');
                this.categoriaManager = new CategoriaManager();
            } catch (error) {
                console.error('Error inicializando categoriaManager:', error);
                this.categoriaManager = null;
            }
        }
        return this.categoriaManager;
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

    async _inicializarManager() {
        try {
            const { IncidenciaManager } = await import('/clases/incidencia.js');
            this.incidenciaManager = new IncidenciaManager();
        } catch (error) {
            console.error('Error cargando IncidenciaManager:', error);
            throw error;
        }
    }

    // ==================== INICIO DEL INIT PRINCIPAL ====================
    async _init() {
        try {
            this._cargarUsuario();

            if (!this.usuarioActual) {
                throw new Error('No se pudo cargar información del usuario');
            }

            await this._inicializarManager();
            await this._initRiesgoManager();
            await this._initCategoriaManager();
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
            this._inicializarFormularioAcumulativo();
            this._configurarDragAndDropYPaste();
            this._cargarNivelesRiesgoEnSelect();
            
            // INICIALIZAR AUTOCOMPLETADO
            this._inicializarAutoCompletado();

            this.imageEditorModal = new window.ImageEditorModal();

        } catch (error) {
            console.error('Error inicializando:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    // ==================== AUTOCOMPLETADO (CORREGIDO) ====================
    _inicializarAutoCompletado() {
        this.descripcionComponent = document.getElementById('detallesIncidencia');
        if (!this.descripcionComponent) {
            console.warn('⚠️ Componente auto-descripcion no encontrado');
            return;
        }
        const org = this.usuarioActual?.organizacionCamelCase || '';
        this.descripcionComponent.setAttribute('organizacion', org);
        
        this.descripcionComponent.addEventListener('input', (e) => {
            let texto = '';
            if (e.detail?.texto) texto = e.detail.texto;
            else if (this.descripcionComponent.value) texto = this.descripcionComponent.value;
            else if (e.target?.value) texto = e.target.value;
            console.log('📝 Texto cambiado:', texto);
            this._validarLongitudCampoCompleto();
            this._verificarBotonesFinales();
        });
        
        const catInput = document.getElementById('categoriaIncidencia');
        if (catInput) {
            new MutationObserver(() => document.dispatchEvent(new Event('categoriaCambiada')))
                .observe(catInput, { attributes: true });
        }
        console.log('✅ Autocompletado listo con org:', org);
    }

    // ==================== FORMULARIO ACUMULATIVO ====================
    _inicializarFormularioAcumulativo() {
        const pasos = document.querySelectorAll('.field-group-step');
        pasos.forEach((paso) => {
            const step = parseInt(paso.dataset.step);
            paso.style.display = step === 0 ? 'block' : 'none';
        });
        this._configurarObservadorPasos();
    }

    _configurarObservadorPasos() {
        const tipoEventoBtns = document.querySelectorAll('.tipo-evento-btn');
        tipoEventoBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setTimeout(() => {
                    if (document.querySelector('.tipo-evento-btn.active')) {
                        const btnActivo = document.querySelector('.tipo-evento-btn.active');
                        this.tipoEventoSeleccionado = btnActivo.dataset.tipo;
                        this._mostrarPaso(1);
                    }
                }, 50);
            });
        });

        const sucursalInput = document.getElementById('sucursalIncidencia');
        if (sucursalInput) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-selected-id') {
                        const tieneSucursal = sucursalInput.dataset.selectedId && sucursalInput.dataset.selectedId !== '';
                        if (tieneSucursal) {
                            this._mostrarPaso(2);
                            this._habilitarCamposPorSucursal(true);
                        }
                    }
                });
            });
            observer.observe(sucursalInput, { attributes: true });
        }

        const categoriaInput = document.getElementById('categoriaIncidencia');
        if (categoriaInput) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-selected-id') {
                        const tieneCategoria = categoriaInput.dataset.selectedId && categoriaInput.dataset.selectedId !== '';
                        if (tieneCategoria) {
                            this._mostrarPaso(3);
                        }
                    }
                });
            });
            observer.observe(categoriaInput, { attributes: true });
        }

        const subcategoriaSelect = document.getElementById('subcategoriaIncidencia');
        if (subcategoriaSelect) {
            subcategoriaSelect.addEventListener('change', () => {
                this._mostrarPaso(4);
                this._aplicarRiesgoAutomatico();
            });
        }

        const riesgoSelect = document.getElementById('nivelRiesgo');
        if (riesgoSelect) {
            riesgoSelect.addEventListener('change', () => {
                if (riesgoSelect.value && riesgoSelect.value !== '' && riesgoSelect.value !== '__otro__') {
                    this._mostrarPaso(5);
                }
            });
        }

        const estadoSelect = document.getElementById('estadoIncidencia');
        if (estadoSelect) {
            estadoSelect.addEventListener('change', () => {
                if (estadoSelect.value) {
                    if (this.tipoEventoSeleccionado === 'tiempo_real') {
                        this._mostrarPasosJuntos([6, 7]);
                        this._configurarModoTiempoRealEnFecha();
                    } else {
                        this._mostrarPaso(6);
                        this._configurarModoHistoricoEnFecha();
                    }
                }
            });
        }
    }

    _configurarModoTiempoRealEnFecha() {
        const fechaInput = document.getElementById('fechaHoraIncidencia');
        if (!fechaInput) return;

        if (!this.fechaHoraTiempoRealFija) {
            this.fechaHoraTiempoRealFija = new Date();
            console.log('🔒 Fecha/Hora Tiempo Real fijada:', this.fechaHoraTiempoRealFija);
        }

        const day = String(this.fechaHoraTiempoRealFija.getDate()).padStart(2, '0');
        const month = String(this.fechaHoraTiempoRealFija.getMonth() + 1).padStart(2, '0');
        const year = this.fechaHoraTiempoRealFija.getFullYear();
        const hours = String(this.fechaHoraTiempoRealFija.getHours()).padStart(2, '0');
        const minutes = String(this.fechaHoraTiempoRealFija.getMinutes()).padStart(2, '0');
        const fechaLegible = `${day}/${month}/${year} ${hours}:${minutes}`;

        fechaInput.value = fechaLegible;
        fechaInput.readOnly = true;
        fechaInput.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        fechaInput.style.cursor = 'pointer';
        fechaInput.style.opacity = '0.9';
        fechaInput.style.borderColor = 'var(--color-accent-primary)';

        if (this.flatpickrInstance) {
            this.flatpickrInstance.destroy();
            this.flatpickrInstance = null;
        }

        this.flatpickrInstance = flatpickr(fechaInput, {
            enableTime: true,
            dateFormat: "d/m/Y H:i",
            time_24hr: true,
            locale: "es",
            defaultDate: this.fechaHoraTiempoRealFija,
            minuteIncrement: 1,
            maxDate: this.fechaHoraTiempoRealFija,
            minDate: this.fechaHoraTiempoRealFija,
            disableMobile: true,
            clickOpens: false,
            allowInput: false
        });

        fechaInput.value = fechaLegible;
        const changeEvent = new Event('change', { bubbles: true });
        fechaInput.dispatchEvent(changeEvent);
    }

    _configurarModoHistoricoEnFecha() {
        const fechaInput = document.getElementById('fechaHoraIncidencia');
        if (!fechaInput) return;

        this.fechaHoraTiempoRealFija = null;
        fechaInput.readOnly = false;
        fechaInput.style.backgroundColor = '';
        fechaInput.style.opacity = '1';
        fechaInput.style.borderColor = '';

        const ahora = new Date();
        const day = String(ahora.getDate()).padStart(2, '0');
        const month = String(ahora.getMonth() + 1).padStart(2, '0');
        const year = ahora.getFullYear();
        const hours = String(ahora.getHours()).padStart(2, '0');
        const minutes = String(ahora.getMinutes()).padStart(2, '0');
        const fechaActualLegible = `${day}/${month}/${year} ${hours}:${minutes}`;
        fechaInput.value = fechaActualLegible;

        if (this.flatpickrInstance) {
            this.flatpickrInstance.destroy();
            this.flatpickrInstance = null;
        }

        this.flatpickrInstance = flatpickr(fechaInput, {
            enableTime: true,
            dateFormat: "d/m/Y H:i",
            time_24hr: true,
            locale: "es",
            defaultDate: ahora,
            minuteIncrement: 1,
            maxDate: new Date(),
            disableMobile: true,
            onChange: (selectedDates, dateStr) => {
                if (selectedDates[0] && selectedDates[0] > new Date()) {
                    this.flatpickrInstance.setDate(new Date(), true);
                    this._mostrarNotificacion('No puedes seleccionar una fecha futura', 'warning', 2000);
                } else if (selectedDates[0]) {
                    const changeEvent = new Event('change', { bubbles: true });
                    fechaInput.dispatchEvent(changeEvent);
                    this._mostrarPaso(7);
                }
            }
        });

        setTimeout(() => {
            if (this.flatpickrInstance) this.flatpickrInstance.open();
        }, 100);
    }

    _mostrarPaso(pasoIndex) {
        const paso = document.querySelector(`.field-group-step[data-step="${pasoIndex}"]`);
        if (paso && paso.style.display !== 'block') {
            paso.style.display = 'block';
            setTimeout(() => {
                const primerInput = paso.querySelector('input:not([readonly]), select, textarea');
                if (primerInput && !primerInput.disabled) primerInput.focus();
            }, 100);
        }
    }

    _mostrarPasosJuntos(pasosArray) {
        pasosArray.forEach(pasoIndex => {
            const paso = document.querySelector(`.field-group-step[data-step="${pasoIndex}"]`);
            if (paso && paso.style.display !== 'block') paso.style.display = 'block';
        });
        if (pasosArray.includes(7)) {
            setTimeout(() => {
                if (this.descripcionComponent) this.descripcionComponent.focus();
            }, 150);
        }
    }

    _verificarBotonesFinales() {
        const tipoEventoValido = document.querySelector('.tipo-evento-btn.active') !== null;
        const sucursalValida = document.getElementById('sucursalIncidencia')?.dataset.selectedId &&
            document.getElementById('sucursalIncidencia')?.value.trim() !== '';
        const categoriaValida = document.getElementById('categoriaIncidencia')?.dataset.selectedId &&
            document.getElementById('categoriaIncidencia')?.value.trim() !== '';
        const riesgoValido = document.getElementById('nivelRiesgo')?.value !== '' &&
            document.getElementById('nivelRiesgo')?.value !== '__otro__';
        const estadoValido = document.getElementById('estadoIncidencia')?.value !== '';
        const fechaValida = document.getElementById('fechaHoraIncidencia')?.value !== '';

        let descripcionValida = false;
        if (this.descripcionComponent && this.descripcionComponent.value !== undefined) {
            const texto = this.descripcionComponent.value?.trim() || '';
            descripcionValida = texto.length >= 10 && texto.length <= LIMITES.DETALLES_INCIDENCIA;
        } else {
            const detallesTextarea = document.getElementById('detallesIncidenciaTextarea');
            const texto = detallesTextarea?.value?.trim() || '';
            descripcionValida = texto.length >= 10 && texto.length <= LIMITES.DETALLES_INCIDENCIA;
        }

        const todoCompleto = tipoEventoValido && sucursalValida && categoriaValida &&
            riesgoValido && estadoValido && fechaValida && descripcionValida;

        const botonesContainer = document.getElementById('originalButtons');
        const seccionImagenes = document.getElementById('seccionImagenesWrapper');

        if (todoCompleto && seccionImagenes && botonesContainer) {
            seccionImagenes.style.display = 'block';
            seccionImagenes.classList.add('visible');
            botonesContainer.style.display = 'flex';
        } else if (botonesContainer && !todoCompleto) {
            botonesContainer.style.display = 'none';
        }
    }

    // ==================== NIVELES DE RIESGO (CORREGIDOS, SIN RECURSIÓN) ====================
    async _cargarNivelesRiesgoEnSelect() {
        if (this.actualizandoRiesgo) return;
        this.actualizandoRiesgo = true;
        try {
            const riesgoSelect = document.getElementById('nivelRiesgo');
            if (!riesgoSelect) return;

            await this._initRiesgoManager();
            this.nivelesRiesgoOptions = [];
            if (this.nivelesRiesgo && this.nivelesRiesgo.length > 0) {
                this.nivelesRiesgo.forEach(nivel => {
                    this.nivelesRiesgoOptions.push({
                        id: nivel.id,
                        nombre: nivel.nombre,
                        color: nivel.color
                    });
                });
            }
            this.nivelesRiesgoOptions.push({
                id: '__otro__',
                nombre: 'Crear nuevo nivel de riesgo',
                color: null
            });
            this._actualizarSelectRiesgoConOpciones();
        } catch (error) {
            console.error('Error cargando niveles de riesgo:', error);
        } finally {
            this.actualizandoRiesgo = false;
        }
    }

    _actualizarSelectRiesgoConOpciones(riesgoIdSeleccionado = null) {
        const riesgoSelect = document.getElementById('nivelRiesgo');
        if (!riesgoSelect) return;

        const valorActual = riesgoSelect.value;
        let options = '<option value="">-- Selecciona el nivel de riesgo --</option>';
        this.nivelesRiesgoOptions.forEach(opcion => {
            const selected = (riesgoIdSeleccionado === opcion.id) ? 'selected' : '';
            options += `<option value="${opcion.id}" ${selected}>${opcion.nombre}</option>`;
        });
        riesgoSelect.innerHTML = options;
        
        if (riesgoIdSeleccionado && riesgoIdSeleccionado !== valorActual) {
            riesgoSelect.value = riesgoIdSeleccionado;
        } else if (!riesgoIdSeleccionado && valorActual && valorActual !== '') {
            riesgoSelect.value = valorActual;
        }
    }

    _mostrarRiesgoAsignadoUnico(riesgoId, riesgoNombre) {
        const riesgoSelect = document.getElementById('nivelRiesgo');
        if (!riesgoSelect) return;
        riesgoSelect.innerHTML = `<option value="${riesgoId}" selected>${this._escapeHTML(riesgoNombre)} (Asignado Automáticamente)</option>`;
        riesgoSelect.disabled = true;
        riesgoSelect.classList.add('field-disabled');
        riesgoSelect.dispatchEvent(new Event('change', { bubbles: true }));
        this._mostrarPaso(5);
    }

    _mostrarListaCompletaRiesgos() {
        const riesgoSelect = document.getElementById('nivelRiesgo');
        if (!riesgoSelect) return;
        this._actualizarSelectRiesgoConOpciones();
        riesgoSelect.disabled = false;
        riesgoSelect.classList.remove('field-disabled');
    }

    async _obtenerRiesgoDesdeSubcategoria(categoriaId, subcategoriaId) {
        if (!categoriaId || !subcategoriaId) return null;
        try {
            await this._initCategoriaManager();
            if (!this.categoriaManager) return null;
            const riesgoId = await this.categoriaManager.obtenerRiesgoDeSubcategoria(
                categoriaId, subcategoriaId, this.usuarioActual.organizacionCamelCase
            );
            if (riesgoId) {
                const riesgoInfo = this.nivelesRiesgoMap.get(riesgoId);
                return riesgoInfo ? { id: riesgoId, nombre: riesgoInfo.nombre, color: riesgoInfo.color } : { id: riesgoId, nombre: riesgoId, color: null };
            }
            return null;
        } catch (error) {
            console.error('Error obteniendo riesgo:', error);
            return null;
        }
    }

    async _aplicarRiesgoAutomatico() {
        const categoriaId = document.getElementById('categoriaIncidencia')?.dataset.selectedId;
        const subcategoriaId = document.getElementById('subcategoriaIncidencia')?.value;
        if (categoriaId && subcategoriaId && subcategoriaId !== '') {
            const riesgoInfo = await this._obtenerRiesgoDesdeSubcategoria(categoriaId, subcategoriaId);
            if (riesgoInfo && riesgoInfo.id) {
                this._mostrarRiesgoAsignadoUnico(riesgoInfo.id, riesgoInfo.nombre);
                this.riesgoSeleccionadoId = riesgoInfo.id;
                return;
            }
        }
        this._mostrarListaCompletaRiesgos();
        this.riesgoSeleccionadoId = null;
    }

    async _crearNuevoNivelRiesgo() {
        const { value: formValues } = await Swal.fire({
            title: 'Crear nuevo nivel de riesgo',
            html: `
                <div class="riesgo-modal-contenido">
                    <div class="riesgo-campo">
                        <label class="riesgo-label"><i class="fas fa-tag"></i> Nombre del nivel *</label>
                        <input type="text" id="nuevoRiesgoNombre" class="riesgo-input" placeholder="Ej: Crítico, Alto, Medio, Bajo">
                    </div>
                    <div class="riesgo-campo">
                        <label class="riesgo-label"><i class="fas fa-palette"></i> Color *</label>
                        <input type="color" id="nuevoRiesgoColor" class="riesgo-color-input" value="#ff0000">
                    </div>
                </div>
            `,
            focusConfirm: false,
            width: '450px',
            background: 'var(--color-bg-secondary)',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save"></i> Crear riesgo',
            cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
            preConfirm: () => {
                const nombre = document.getElementById('nuevoRiesgoNombre')?.value.trim();
                const color = document.getElementById('nuevoRiesgoColor')?.value;
                if (!nombre) {
                    Swal.showValidationMessage('❌ El nombre es obligatorio');
                    return false;
                }
                if (nombre.length < 2 || nombre.length > 30) {
                    Swal.showValidationMessage('❌ El nombre debe tener entre 2 y 30 caracteres');
                    return false;
                }
                return { nombre, color };
            }
        });
        if (!formValues) return null;

        try {
            Swal.fire({ title: 'Guardando...', text: 'Creando nuevo nivel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const nuevoNivel = await this.riesgoManager.crearNivel({ nombre: formValues.nombre, color: formValues.color }, this.usuarioActual);
            await this._initRiesgoManager();
            await this._cargarNivelesRiesgoEnSelect();
            Swal.fire({ icon: 'success', title: '✓ Nivel creado', timer: 2000, showConfirmButton: false });
            return nuevoNivel.id;
        } catch (error) {
            console.error('Error creando nivel:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: error.message });
            return null;
        }
    }

    async _asociarRiesgoASubcategoria(categoriaId, subcategoriaId, riesgoId) {
        try {
            await this._initCategoriaManager();
            if (!this.categoriaManager) throw new Error('CategoriaManager no disponible');
            Swal.fire({ title: 'Asociando riesgo...', text: 'Actualizando la subcategoría...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            await this.categoriaManager.asignarRiesgoASubcategoria(categoriaId, subcategoriaId, riesgoId, this.usuarioActual, this.usuarioActual.organizacionCamelCase);
            Swal.fire({ icon: 'success', title: 'Riesgo asociado', text: 'El nivel de riesgo se ha asociado a la subcategoría', timer: 2000, showConfirmButton: false });
            await this._aplicarRiesgoAutomatico();
        } catch (error) {
            console.error('Error asociando riesgo:', error);
            Swal.close();
            Swal.fire({ icon: 'error', title: 'Error', text: error.message });
        }
    }

    async _manejarSeleccionRiesgo() {
        if (this.actualizandoRiesgo) return;
        this.actualizandoRiesgo = true;
        try {
            const riesgoSelect = document.getElementById('nivelRiesgo');
            if (riesgoSelect.disabled) return;
            const valorSeleccionado = riesgoSelect.value;

            if (valorSeleccionado === '__otro__') {
                const nuevoRiesgoId = await this._crearNuevoNivelRiesgo();
                if (nuevoRiesgoId) {
                    await this._cargarNivelesRiesgoEnSelect();
                    const nuevoSelect = document.getElementById('nivelRiesgo');
                    nuevoSelect.value = nuevoRiesgoId;
                    const subcategoriaId = document.getElementById('subcategoriaIncidencia')?.value;
                    const categoriaId = document.getElementById('categoriaIncidencia')?.dataset.selectedId;
                    if (subcategoriaId && categoriaId) {
                        const { value: asociar } = await Swal.fire({
                            title: '¿Asociar riesgo a la subcategoría?',
                            text: '¿Deseas asociar este nuevo nivel a la subcategoría seleccionada?',
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'Sí, asociar',
                            cancelButtonText: 'No, solo para esta incidencia'
                        });
                        if (asociar) await this._asociarRiesgoASubcategoria(categoriaId, subcategoriaId, nuevoRiesgoId);
                    }
                } else {
                    await this._cargarNivelesRiesgoEnSelect();
                }
                return;
            }

            if (valorSeleccionado && valorSeleccionado !== '' && valorSeleccionado !== '__otro__') {
                const subcategoriaId = document.getElementById('subcategoriaIncidencia')?.value;
                const categoriaId = document.getElementById('categoriaIncidencia')?.dataset.selectedId;
                if (subcategoriaId && categoriaId) {
                    const riesgoActual = await this._obtenerRiesgoDesdeSubcategoria(categoriaId, subcategoriaId);
                    if (!riesgoActual || !riesgoActual.id) {
                        const riesgoNombre = this._getRiesgoTexto(valorSeleccionado);
                        const { value: asociar } = await Swal.fire({
                            title: '¿Asociar riesgo a la subcategoría?',
                            html: `¿Asociar el riesgo <strong>${this._escapeHTML(riesgoNombre)}</strong> a esta subcategoría?`,
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'Sí, asociar',
                            cancelButtonText: 'No, solo esta vez'
                        });
                        if (asociar) await this._asociarRiesgoASubcategoria(categoriaId, subcategoriaId, valorSeleccionado);
                    }
                }
            }
        } finally {
            this.actualizandoRiesgo = false;
        }
    }

    // ==================== DRAG & DROP y PASTE de IMÁGENES ====================
    _configurarDragAndDropYPaste() {
        let dropZone = document.getElementById('dropZone');
        if (!dropZone) {
            this._crearDropZone();
            dropZone = document.getElementById('dropZone');
            if (!dropZone) return;
        }

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
        });
        ['dragenter', 'dragover'].forEach(ev => {
            dropZone.addEventListener(ev, () => dropZone.classList.add('drag-over'));
        });
        ['dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'));
        });

        dropZone.addEventListener('drop', e => {
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length) this._procesarImagenes(files);
        });

        dropZone.addEventListener('click', () => {
            let input = document.getElementById('inputImagenes');
            if (!input) input = this._crearInputImagenes();
            input.click();
        });

        document.addEventListener('paste', e => this._manejarPegarImagen(e));
    }

    _crearInputImagenes() {
        let input = document.getElementById('inputImagenes');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.id = 'inputImagenes';
            input.multiple = true;
            input.accept = 'image/jpeg,image/png,image/jpg,image/webp';
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', e => {
                if (e.target.files) this._procesarImagenes(e.target.files);
                input.value = '';
            });
        }
        return input;
    }

    _crearDropZone() {
        const wrapper = document.querySelector('.image-upload-section-wrapper');
        if (!wrapper) return;
        const cardBody = wrapper.querySelector('.card-body');
        if (!cardBody) return;
        const dropHTML = `
            <div id="dropZone" class="drop-zone">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Arrastra y suelta imágenes aquí</p>
                <p class="small">o haz clic para seleccionar archivos</p>
                <p class="small text-muted mt-2"><i class="fas fa-keyboard"></i> También puedes pegar imágenes con Ctrl+V</p>
                <p class="small text-muted">Formatos: JPG, JPEG, PNG, WEBP. Máximo 10MB por imagen.</p>
            </div>
        `;
        const preview = document.getElementById('imagenesPreview');
        if (preview) preview.insertAdjacentHTML('beforebegin', dropHTML);
        else cardBody.insertAdjacentHTML('afterbegin', dropHTML);
        this._crearInputImagenes();
        this._configurarDragAndDropYPaste();
    }

    _manejarPegarImagen(event) {
        const items = event.clipboardData?.items;
        if (!items) return;
        const imageFiles = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    const ext = file.type.split('/')[1] || 'png';
                    const renamed = new File([file], `pasted_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${ext}`, { type: file.type });
                    imageFiles.push(renamed);
                }
            }
        }
        if (imageFiles.length) {
            event.preventDefault();
            this._procesarImagenes(imageFiles);
        }
    }

    _procesarImagenes(files) {
        if (!files || !files.length) return;
        const maxSize = 10 * 1024 * 1024;
        const maxImages = 20;
        if (this.imagenesSeleccionadas.length + files.length > maxImages) {
            this._mostrarError(`Máximo ${maxImages} imágenes permitidas`);
            return;
        }
        Array.from(files).forEach(file => {
            if (file.size > maxSize) {
                console.warn(`Imagen ${file.name} excede 10MB`);
                return;
            }
            if (!['image/jpeg','image/png','image/jpg','image/webp'].includes(file.type)) {
                console.warn(`Formato no válido: ${file.name}`);
                return;
            }
            const generatedName = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            this.imagenesSeleccionadas.push({
                file, preview: URL.createObjectURL(file), comentario: '', elementos: [], edited: false, generatedName
            });
        });
        this._actualizarVistaPreviaImagenes();
        const inputImg = document.getElementById('inputImagenes');
        if (inputImg) inputImg.value = '';
    }

    _actualizarVistaPreviaImagenes() {
        const container = document.getElementById('imagenesPreview');
        const countSpan = document.getElementById('imagenesCount');
        if (!container) return;
        if (countSpan) countSpan.textContent = this.imagenesSeleccionadas.length;
        if (this.imagenesSeleccionadas.length === 0) {
            container.innerHTML = `<div class="no-images"><i class="fas fa-images"></i><p>No hay imágenes seleccionadas</p></div>`;
            return;
        }
        let html = '';
        this.imagenesSeleccionadas.forEach((img, idx) => {
            html += `
                <div class="preview-item">
                    <img src="${img.preview}" alt="Preview ${idx+1}">
                    <div class="preview-overlay">
                        <button type="button" class="preview-btn edit-btn" data-index="${idx}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button type="button" class="preview-btn delete-btn" data-index="${idx}" title="Eliminar"><i class="fas fa-trash"></i></button>
                        ${img.edited ? '<span class="edited-badge"><i class="fas fa-check"></i> Editada</span>' : ''}
                    </div>
                    ${img.comentario ? `<div class="image-comment"><i class="fas fa-comment"></i> ${this._escapeHTML(img.comentario.substring(0,30))}${img.comentario.length>30?'...':''}</div>` : ''}
                </div>
            `;
        });
        container.innerHTML = html;
        container.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', e => this._editarImagen(parseInt(e.currentTarget.dataset.index))));
        container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', e => this._eliminarImagen(parseInt(e.currentTarget.dataset.index))));
    }

    _editarImagen(index) {
        if (this.imageEditorModal && this.imagenesSeleccionadas[index]) {
            const img = this.imagenesSeleccionadas[index];
            this.imageEditorModal.show(img.file, index, img.comentario, (savedIndex, editedFile, comentario, elementos) => {
                URL.revokeObjectURL(this.imagenesSeleccionadas[savedIndex].preview);
                this.imagenesSeleccionadas[savedIndex].file = editedFile;
                this.imagenesSeleccionadas[savedIndex].comentario = comentario;
                this.imagenesSeleccionadas[savedIndex].elementos = elementos;
                this.imagenesSeleccionadas[savedIndex].edited = true;
                this.imagenesSeleccionadas[savedIndex].preview = URL.createObjectURL(editedFile);
                this._actualizarVistaPreviaImagenes();
            });
        }
    }

    _eliminarImagen(index) {
        Swal.fire({
            title: '¿Eliminar imagen?', text: 'No se puede deshacer', icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#dc3545', cancelButtonColor: '#6c757d', confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
        }).then(result => {
            if (result.isConfirmed) {
                URL.revokeObjectURL(this.imagenesSeleccionadas[index].preview);
                this.imagenesSeleccionadas.splice(index, 1);
                this._actualizarVistaPreviaImagenes();
            }
        });
    }

    // ==================== VALIDACIONES Y CONTADOR ====================
    _inicializarValidaciones() {
        if (this.descripcionComponent) {
            this.descripcionComponent.addEventListener('input', () => {
                this._validarLongitudCampoCompleto();
                this._verificarBotonesFinales();
            });
        } else {
            const textarea = document.getElementById('detallesIncidenciaTextarea');
            if (textarea) {
                textarea.maxLength = LIMITES.DETALLES_INCIDENCIA;
                textarea.addEventListener('input', () => {
                    this._validarLongitudCampo(textarea, LIMITES.DETALLES_INCIDENCIA, 'Los detalles');
                    this._actualizarContador('detallesIncidenciaTextarea', 'contadorCaracteres', LIMITES.DETALLES_INCIDENCIA);
                    this._verificarBotonesFinales();
                });
            }
        }
        this._actualizarContador('', 'contadorCaracteres', LIMITES.DETALLES_INCIDENCIA);
    }

    _validarLongitudCampoCompleto() {
        if (!this.descripcionComponent) return;
        const texto = this.descripcionComponent.value || '';
        const limite = LIMITES.DETALLES_INCIDENCIA;
        if (texto.length > limite) {
            this.descripcionComponent.value = texto.substring(0, limite);
            this._mostrarNotificacion(`La descripción no puede exceder ${limite} caracteres`, 'warning', 3000);
        }
        const counter = document.getElementById('contadorCaracteres');
        if (counter) counter.textContent = `${texto.length}/${limite}`;
    }

    _validarLongitudCampo(campo, limite, nombre) {
        if (campo.value.length > limite) {
            campo.value = campo.value.substring(0, limite);
            this._mostrarNotificacion(`${nombre} no puede exceder ${limite} caracteres`, 'warning', 3000);
        }
    }

    _actualizarContador(inputId, counterId, limite) {
        const counter = document.getElementById(counterId);
        if (!counter) return;
        const texto = this.descripcionComponent ? this.descripcionComponent.value : '';
        const longitud = texto.length;
        counter.textContent = `${longitud}/${limite}`;
        if (longitud > limite * 0.9) counter.style.color = 'var(--color-warning)';
        else if (longitud > limite * 0.95) counter.style.color = 'var(--color-danger)';
        else counter.style.color = 'var(--color-accent-primary)';
    }

    // ==================== EVENTOS Y SUGERENCIAS (SUCURSAL/CATEGORÍA) ====================
    _configurarEventos() {
        try {
            document.getElementById('btnVolverLista')?.addEventListener('click', () => this._volverALista());
            document.getElementById('btnCancelar')?.addEventListener('click', () => this._cancelarCreacion());
            document.getElementById('btnCrearIncidencia')?.addEventListener('click', (e) => {
                e.preventDefault();
                this._validarYGuardar();
            });
            document.getElementById('formIncidenciaPrincipal')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this._validarYGuardar();
            });

            document.getElementById('categoriaIncidencia')?.addEventListener('change', (e) => {
                const categoriaId = e.target.dataset.selectedId;
                if (categoriaId) this._cargarSubcategorias(categoriaId);
            });

            const subSelect = document.getElementById('subcategoriaIncidencia');
            if (subSelect) {
                subSelect.addEventListener('change', () => {
                    this._aplicarRiesgoAutomatico();
                    subSelect.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }

            const riesgoSelect = document.getElementById('nivelRiesgo');
            if (riesgoSelect) riesgoSelect.addEventListener('change', () => this._manejarSeleccionRiesgo());

            this._configurarSugerencias();
        } catch (error) {
            console.error('Error configurando eventos:', error);
        }
    }

    _configurarSugerencias() {
        const inputSucursal = document.getElementById('sucursalIncidencia');
        const inputCategoria = document.getElementById('categoriaIncidencia');

        if (inputSucursal) {
            inputSucursal.addEventListener('input', e => this._mostrarSugerenciasSucursal(e.target.value));
            inputSucursal.addEventListener('blur', () => setTimeout(() => {
                const cont = document.getElementById('sugerenciasSucursal');
                if (cont) cont.innerHTML = '';
            }, 200));
        }
        if (inputCategoria) {
            inputCategoria.addEventListener('input', e => this._mostrarSugerenciasCategoria(e.target.value));
            inputCategoria.addEventListener('blur', () => setTimeout(() => {
                const cont = document.getElementById('sugerenciasCategoria');
                if (cont) cont.innerHTML = '';
            }, 200));
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
        const sugerencias = this.sucursales.filter(s =>
            s.nombre.toLowerCase().includes(terminoLower) ||
            (s.ciudad && s.ciudad.toLowerCase().includes(terminoLower)) ||
            (s.direccion && s.direccion.toLowerCase().includes(terminoLower))
        ).slice(0, 8);
        if (!sugerencias.length) {
            contenedor.innerHTML = `<div class="sugerencias-lista"><div class="sugerencia-vacia"><i class="fas fa-store"></i><p>No se encontraron sucursales</p></div></div>`;
            return;
        }
        let html = '<div class="sugerencias-lista">';
        sugerencias.forEach(suc => {
            const selected = document.getElementById('sucursalIncidencia').dataset.selectedId === suc.id;
            html += `
                <div class="sugerencia-item ${selected ? 'seleccionada' : ''}" data-id="${suc.id}" data-nombre="${suc.nombre}">
                    <div class="sugerencia-icono"><i class="fas fa-store"></i></div>
                    <div class="sugerencia-info">
                        <div class="sugerencia-nombre">${this._escapeHTML(suc.nombre)}</div>
                        <div class="sugerencia-detalle"><i class="fas fa-map-marker-alt"></i>${suc.ciudad || 'Sin ciudad'} - ${suc.direccion || 'Sin dirección'}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        contenedor.innerHTML = html;
        contenedor.querySelectorAll('.sugerencia-item').forEach(item => {
            item.addEventListener('click', () => this._seleccionarSucursal(item.dataset.id, item.dataset.nombre));
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
        const sugerencias = this.categorias.filter(c => c.nombre.toLowerCase().includes(terminoLower)).slice(0, 8);
        if (!sugerencias.length) {
            contenedor.innerHTML = `<div class="sugerencias-lista"><div class="sugerencia-vacia"><i class="fas fa-tags"></i><p>No se encontraron categorías</p></div></div>`;
            return;
        }
        let html = '<div class="sugerencias-lista">';
        sugerencias.forEach(cat => {
            const selected = document.getElementById('categoriaIncidencia').dataset.selectedId === cat.id;
            const totalSub = cat.subcategorias ? (cat.subcategorias instanceof Map ? cat.subcategorias.size : Object.keys(cat.subcategorias).length) : 0;
            html += `
                <div class="sugerencia-item ${selected ? 'seleccionada' : ''}" data-id="${cat.id}" data-nombre="${cat.nombre}">
                    <div class="sugerencia-icono"><i class="fas fa-tag"></i></div>
                    <div class="sugerencia-info">
                        <div class="sugerencia-nombre">${this._escapeHTML(cat.nombre)}</div>
                        <div class="sugerencia-detalle"><i class="fas fa-layer-group"></i>${totalSub} subcategorías</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        contenedor.innerHTML = html;
        contenedor.querySelectorAll('.sugerencia-item').forEach(item => {
            item.addEventListener('click', () => this._seleccionarCategoria(item.dataset.id, item.dataset.nombre));
        });
    }

    _seleccionarSucursal(id, nombre) {
        const input = document.getElementById('sucursalIncidencia');
        input.value = nombre;
        input.dataset.selectedId = id;
        input.dataset.selectedName = nombre;
        document.getElementById('sugerenciasSucursal').innerHTML = '';
        this._habilitarCamposPorSucursal(true);
        this._mostrarPaso(2);
    }

    _seleccionarCategoria(id, nombre) {
        const input = document.getElementById('categoriaIncidencia');
        input.value = nombre;
        input.dataset.selectedId = id;
        input.dataset.selectedName = nombre;
        document.getElementById('sugerenciasCategoria').innerHTML = '';
        this._cargarSubcategorias(id);
        this._mostrarPaso(3);
    }

    async _cargarSubcategorias(categoriaId) {
        const select = document.getElementById('subcategoriaIncidencia');
        if (!select) return;
        select.innerHTML = '<option value="">Cargando subcategorías...</option>';
        select.disabled = true;
        if (!categoriaId) {
            select.innerHTML = '<option value="">-- Selecciona una subcategoría (opcional) --</option>';
            select.disabled = true;
            return;
        }
        const categoria = this.categorias.find(c => c.id === categoriaId);
        if (!categoria) {
            select.innerHTML = '<option value="">-- Error: Categoría no encontrada --</option>';
            select.disabled = true;
            return;
        }
        this.categoriaSeleccionada = categoria;
        try {
            let subArray = [];
            if (categoria.subcategorias) {
                if (categoria.subcategorias instanceof Map) {
                    categoria.subcategorias.forEach((valor, clave) => {
                        if (valor && typeof valor === 'object') subArray.push({ id: clave, nombre: valor.nombre || clave, riesgoNivelId: valor.riesgoNivelId || null });
                    });
                } else if (categoria.subcategorias.entries && typeof categoria.subcategorias.entries === 'function') {
                    for (const [clave, valor] of categoria.subcategorias.entries()) {
                        if (valor && typeof valor === 'object') subArray.push({ id: clave, nombre: valor.nombre || clave, riesgoNivelId: valor.riesgoNivelId || null });
                    }
                } else if (typeof categoria.subcategorias.forEach === 'function') {
                    categoria.subcategorias.forEach((valor, clave) => {
                        if (valor && typeof valor === 'object') subArray.push({ id: clave, nombre: valor.nombre || clave, riesgoNivelId: valor.riesgoNivelId || null });
                    });
                } else if (typeof categoria.subcategorias === 'object') {
                    subArray = Object.keys(categoria.subcategorias).map(key => ({
                        id: key, nombre: categoria.subcategorias[key]?.nombre || key, riesgoNivelId: categoria.subcategorias[key]?.riesgoNivelId || null
                    }));
                }
            }
            if (subArray.length === 0) {
                select.innerHTML = '<option value="">-- No hay subcategorías disponibles --</option>';
                select.disabled = true;
                return;
            }
            let options = '<option value="">-- Selecciona una subcategoría (opcional) --</option>';
            subArray.forEach(sub => { options += `<option value="${sub.id}" data-riesgo-id="${sub.riesgoNivelId || ''}">${sub.nombre}</option>`; });
            select.innerHTML = options;
            select.disabled = false;
        } catch (error) {
            console.error('Error cargando subcategorías:', error);
            select.innerHTML = '<option value="">-- Error cargando subcategorías --</option>';
            select.disabled = true;
        }
    }

    _habilitarCamposPorSucursal(habilitar) {
        const campos = ['categoriaIncidencia', 'nivelRiesgo', 'subcategoriaIncidencia', 'detallesIncidencia'];
        campos.forEach(id => {
            const campo = document.getElementById(id);
            if (campo) {
                campo.disabled = !habilitar;
                if (!habilitar) {
                    if (campo.tagName === 'AUTO-DESCRIPCION') campo.value = '';
                    else campo.value = '';
                }
            }
        });
        if (!habilitar) {
            const catInput = document.getElementById('categoriaIncidencia');
            if (catInput) { delete catInput.dataset.selectedId; delete catInput.dataset.selectedName; }
            const subSelect = document.getElementById('subcategoriaIncidencia');
            if (subSelect) subSelect.innerHTML = '<option value="">-- Selecciona una subcategoría (opcional) --</option>';
            this.categoriaSeleccionada = null;
        }
    }

    // ==================== CARGA DE DATOS (SUCURSALES, CATEGORÍAS, ÁREAS) ====================
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
            const manager = new SucursalManager();
            this.sucursales = await manager.getSucursalesByOrganizacion(this.usuarioActual.organizacionCamelCase);
        } catch (error) {
            console.error('Error cargando sucursales:', error);
            throw error;
        }
    }

    async _cargarCategorias() {
        try {
            const { CategoriaManager } = await import('/clases/categoria.js');
            const manager = new CategoriaManager();
            this.categoriasOriginales = await manager.obtenerTodasCategorias();
            this.categorias = [...this.categoriasOriginales];
        } catch (error) {
            console.error('Error cargando categorías:', error);
            throw error;
        }
    }

    async _cargarAreas() {
        try {
            const { AreaManager } = await import('/clases/area.js');
            this.AreaManager = new AreaManager();
            if (this.usuarioActual?.organizacionCamelCase) {
                const areas = await this.AreaManager.getAreasByOrganizacion(this.usuarioActual.organizacionCamelCase, true);
                this.areas = areas.filter(a => a.estado === 'activa');
            }
        } catch (error) {
            console.error('Error cargando áreas:', error);
            this.areas = [];
        }
    }

    async _cargarSucursalesParaNotificacion() {
        try {
            const { SucursalManager } = await import('/clases/sucursal.js');
            const manager = new SucursalManager();
            this.sucursalesParaNotificar = await manager.getSucursalesByOrganizacion(this.usuarioActual.organizacionCamelCase);
        } catch (error) {
            console.error('Error cargando sucursales para notificación:', error);
            this.sucursalesParaNotificar = [];
        }
    }

    _configurarOrganizacion() {
        const orgInput = document.getElementById('organization');
        if (orgInput) orgInput.value = this.usuarioActual.organizacion;
    }

    _inicializarDateTimePicker() {
        const fechaInput = document.getElementById('fechaHoraIncidencia');
        if (!fechaInput) return;
        if (typeof flatpickr !== 'undefined') {
            this.flatpickrInstance = flatpickr(fechaInput, {
                enableTime: true, dateFormat: "d/m/Y H:i", time_24hr: true, locale: "es",
                minuteIncrement: 1, maxDate: new Date(), disableMobile: true
            });
        }
        this._configurarBotonesTipoEvento();
    }

    _configurarBotonesTipoEvento() {
        const botones = document.querySelectorAll('.tipo-evento-btn');
        let tipoSeleccionado = null;
        const desactivarTodos = () => botones.forEach(btn => btn.classList.remove('active'));
        botones.forEach(btn => {
            btn.addEventListener('click', () => {
                const tipo = btn.dataset.tipo;
                if (tipoSeleccionado === tipo) {
                    desactivarTodos();
                    tipoSeleccionado = null;
                    this.tipoEventoSeleccionado = null;
                    this.fechaHoraTiempoRealFija = null;
                    const fechaInput = document.getElementById('fechaHoraIncidencia');
                    if (fechaInput) {
                        fechaInput.value = '';
                        fechaInput.readOnly = false;
                        fechaInput.style.backgroundColor = '';
                        if (this.flatpickrInstance) {
                            this.flatpickrInstance.destroy();
                            this.flatpickrInstance = flatpickr(fechaInput, {
                                enableTime: true, dateFormat: "d/m/Y H:i", time_24hr: true, locale: "es",
                                minuteIncrement: 1, maxDate: new Date(), disableMobile: true
                            });
                        }
                    }
                } else {
                    desactivarTodos();
                    btn.classList.add('active');
                    tipoSeleccionado = tipo;
                    this.tipoEventoSeleccionado = tipo;
                }
                document.dispatchEvent(new Event('tipoEventoChanged'));
            });
        });
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
                    organizacionCamelCase: adminData.organizacionCamelCase || this._generarCamelCase(adminData.organizacion),
                    correo: adminData.correoElectronico || '',
                    email: adminData.correoElectronico || '',
                    codigoColaborador: adminData.codigoColaborador || ''
                };
                return;
            }
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            if (userData && Object.keys(userData).length) {
                this.usuarioActual = {
                    id: userData.uid || userData.id || `user_${Date.now()}`,
                    uid: userData.uid || userData.id,
                    nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                    organizacion: userData.organizacion || userData.empresa || 'Sin organización',
                    organizacionCamelCase: userData.organizacionCamelCase || this._generarCamelCase(userData.organizacion || userData.empresa),
                    correo: userData.correo || userData.email || '',
                    codigoColaborador: userData.codigoColaborador || ''
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
                email: 'admin@centinela.com',
                codigoColaborador: ''
            };
        } catch (error) {
            console.error('Error cargando usuario:', error);
            throw error;
        }
    }

    _generarCamelCase(texto) {
        if (!texto || typeof texto !== 'string') return 'miOrganizacion';
        return texto.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    // ==================== GUARDAR INCIDENCIA (COMPLETO) ====================
    async _validarYGuardar() {
        const sucursalInput = document.getElementById('sucursalIncidencia');
        const categoriaInput = document.getElementById('categoriaIncidencia');
        const sucursalId = sucursalInput?.dataset.selectedId;
        const categoriaId = categoriaInput?.dataset.selectedId;
        if (!sucursalId) { this._mostrarError('⚠️ Selecciona una sucursal'); sucursalInput.focus(); return; }
        if (!categoriaId) { this._mostrarError('Selecciona una categoría'); categoriaInput.focus(); return; }

        const riesgoSelect = document.getElementById('nivelRiesgo');
        const nivelRiesgo = riesgoSelect.value;
        if (!nivelRiesgo || nivelRiesgo === '__otro__') { this._mostrarError('Selecciona el nivel de riesgo'); riesgoSelect.focus(); return; }

        const estadoSelect = document.getElementById('estadoIncidencia');
        const estado = estadoSelect.value;
        if (!estado) { this._mostrarError('Selecciona el estado'); estadoSelect.focus(); return; }

        const tipoEvento = this._obtenerTipoEventoSeleccionado();
        if (!tipoEvento) { this._mostrarError('Selecciona tipo de evento'); return; }

        const fechaInput = document.getElementById('fechaHoraIncidencia');
        const fechaHora = fechaInput.value;
        if (!fechaHora) { this._mostrarError('Selecciona fecha y hora'); fechaInput.focus(); return; }

        let fechaSeleccionada;
        if (tipoEvento === 'tiempo_real' && this.fechaHoraTiempoRealFija) {
            fechaSeleccionada = new Date(this.fechaHoraTiempoRealFija);
        } else {
            if (fechaHora.includes('/')) {
                const [fechaPart, horaPart] = fechaHora.split(' ');
                const [d, m, y] = fechaPart.split('/');
                const [h, min] = horaPart.split(':');
                fechaSeleccionada = new Date(+y, +m-1, +d, +h, +min);
            } else {
                fechaSeleccionada = new Date(fechaHora);
            }
        }
        const ahora = new Date();
        if (isNaN(fechaSeleccionada)) { this._mostrarError('Fecha no válida'); fechaInput.focus(); return; }
        if (tipoEvento !== 'tiempo_real' && fechaSeleccionada > ahora) { this._mostrarError('No puedes seleccionar una fecha futura'); fechaInput.focus(); return; }

        let detalles = '';
        if (this.descripcionComponent && this.descripcionComponent.value !== undefined) {
            detalles = this.descripcionComponent.value.trim();
        } else {
            const fallback = document.getElementById('detallesIncidenciaTextarea');
            detalles = fallback?.value.trim() || '';
        }
        if (!detalles) { this._mostrarError('La descripción es obligatoria'); if(this.descripcionComponent) this.descripcionComponent.focus(); return; }
        if (detalles.length < 10) { this._mostrarError('La descripción debe tener al menos 10 caracteres'); if(this.descripcionComponent) this.descripcionComponent.focus(); return; }

        const subcategoriaSelect = document.getElementById('subcategoriaIncidencia');
        const subcategoriaId = subcategoriaSelect.value;
        const sucursalNombre = sucursalInput.value;
        const categoriaNombre = categoriaInput.value;

        const datos = {
            sucursalId, sucursalNombre, categoriaId, categoriaNombre,
            subcategoriaId: subcategoriaId || '', nivelRiesgo, estado,
            fechaHora: fechaSeleccionada.toISOString(), detalles,
            imagenes: this.imagenesSeleccionadas, tipoEvento
        };

        const confirm = await Swal.fire({
            title: 'Confirmar creación',
            html: `<div style="text-align:left;">
                <p><strong>Tipo:</strong> ${tipoEvento === 'tiempo_real' ? 'Tiempo Real' : 'Histórico'}</p>
                <p><strong>Sucursal:</strong> ${this._escapeHTML(sucursalNombre)}</p>
                <p><strong>Categoría:</strong> ${this._escapeHTML(categoriaNombre)}</p>
                ${subcategoriaId ? `<p><strong>Subcategoría:</strong> ${this._escapeHTML(subcategoriaSelect.options[subcategoriaSelect.selectedIndex]?.text)}</p>` : ''}
                <p><strong>Riesgo:</strong> ${this._getRiesgoTexto(nivelRiesgo)}</p>
                <p><strong>Estado:</strong> ${estado === 'pendiente' ? 'Pendiente' : 'Finalizada'}</p>
                <p><strong>Fecha:</strong> ${fechaSeleccionada.toLocaleString('es-MX')}</p>
                <p><strong>Evidencias:</strong> ${this.imagenesSeleccionadas.length} imagen(es)</p>
            </div>`,
            icon: 'question', showCancelButton: true, confirmButtonText: '<i class="fas fa-save"></i> Crear', cancelButtonText: 'Cancelar'
        });
        if (confirm.isConfirmed) await this._guardarIncidencia(datos);
    }

    async _guardarIncidencia(datos) {
        const btnCrear = document.getElementById('btnCrearIncidencia');
        const originalHTML = btnCrear?.innerHTML || '<i class="fas fa-check"></i> Crear';
        try {
            if (btnCrear) { btnCrear.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; btnCrear.disabled = true; }
            Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const fechaObj = new Date(datos.fechaHora);
            const incidenciaData = {
                sucursalId: datos.sucursalId, categoriaId: datos.categoriaId, subcategoriaId: datos.subcategoriaId,
                nivelRiesgo: datos.nivelRiesgo, estado: datos.estado, fechaInicio: fechaObj,
                detalles: datos.detalles, reportadoPorId: this.usuarioActual.id,
                reportadoPorCodigo: this.usuarioActual.codigoColaborador || ''
            };
            const nuevaIncidencia = await this.incidenciaManager.crearIncidencia(incidenciaData, this.usuarioActual, [], []);
            const folio = nuevaIncidencia.id;

            let imagenesSubidas = [];
            if (datos.imagenes?.length) {
                Swal.update({ title: 'Subiendo imágenes...' });
                const uploads = datos.imagenes.map(async img => {
                    const ruta = `incidencias_${this.usuarioActual.organizacionCamelCase}/${folio}/imagenes/${img.generatedName}`;
                    const res = await this.incidenciaManager.subirArchivo(img.file, ruta);
                    return { url: res.url, path: res.path, comentario: img.comentario || '', elementos: img.elementos || [], nombre: img.file.name, generatedName: img.generatedName, tipo: img.file.type, tamaño: img.file.size };
                });
                imagenesSubidas = await Promise.all(uploads);
                await this.incidenciaManager.actualizarImagenes(folio, imagenesSubidas, this.usuarioActual.organizacionCamelCase, this.usuarioActual.id, this.usuarioActual.nombreCompleto);
            }

            Swal.update({ title: 'Generando PDF...' });
            const incidenciaParaPDF = {
                ...nuevaIncidencia, id: folio, sucursalNombre: datos.sucursalNombre, categoriaNombre: datos.categoriaNombre,
                detalles: datos.detalles, fechaInicio: fechaObj, fechaCreacion: new Date(),
                imagenes: imagenesSubidas, reportadoPorNombre: this.usuarioActual.nombreCompleto,
                reportadoPorCodigo: this.usuarioActual.codigoColaborador || '', getSeguimientosArray: () => []
            };
            let pdfBlob = null;
            try { pdfBlob = await this.pdfGenerator.generarIPH(incidenciaParaPDF, { mostrarAlerta: false, returnBlob: true }); } catch(e) { console.error(e); }

            Swal.update({ title: 'Subiendo PDF...' });
            let pdfUrl = null;
            if (pdfBlob?.size) {
                const pdfFile = new File([pdfBlob], `incidencia_${folio}.pdf`, { type: 'application/pdf' });
                const rutaPDF = `incidencias_${this.usuarioActual.organizacionCamelCase}/${folio}/pdf/incidencia_${folio}.pdf`;
                const resPDF = await this.incidenciaManager.subirArchivo(pdfFile, rutaPDF);
                pdfUrl = resPDF.url;
                await this.incidenciaManager.actualizarPDF(folio, pdfUrl, this.usuarioActual.organizacionCamelCase, this.usuarioActual.id, this.usuarioActual.nombreCompleto);
            }
            Swal.close();

            if (pdfUrl) await this._mostrarDialogoCompartir(pdfUrl, datos);

            // Canalización a sucursal
            const quiereSucursal = await Swal.fire({ icon: 'question', title: '¿Canalizar a la sucursal?', text: '¿Deseas canalizar esta incidencia a la sucursal?', showCancelButton: true, confirmButtonText: 'Sí', cancelButtonText: 'No' });
            let sucursalCanalizada = null;
            if (quiereSucursal.isConfirmed) sucursalCanalizada = await this._canalizarSucursal(folio, datos.detalles.substring(0,50));

            const quiereArea = await Swal.fire({ icon: 'question', title: '¿Canalizar a área(s)?', text: '¿Deseas canalizar a alguna área?', showCancelButton: true, confirmButtonText: 'Sí', cancelButtonText: 'No' });
            let areasCanalizadas = [];
            if (quiereArea.isConfirmed) areasCanalizadas = await this._canalizarAreas(folio, datos.detalles.substring(0,50));

            let mensaje = `Incidencia creada con folio ${folio}. `;
            if (sucursalCanalizada) mensaje += `Canalizada a sucursal ${sucursalCanalizada.nombre}. `;
            if (areasCanalizadas.length) mensaje += `Canalizada a ${areasCanalizadas.length} área(s).`;
            await Swal.fire({ icon: 'success', title: '¡Incidencia creada!', text: mensaje, confirmButtonText: 'Ver incidencias' });
            this._volverALista();
        } catch (error) {
            console.error(error);
            Swal.close();
            this._mostrarError(error.message || 'Error al crear incidencia');
        } finally {
            if (btnCrear) { btnCrear.innerHTML = originalHTML; btnCrear.disabled = false; }
        }
    }

    async _mostrarDialogoCompartir(pdfUrl, datos) {
        return new Promise((resolve) => {
            Swal.fire({
                title: 'Compartir incidencia',
                html: `
                    <div style="text-align:center;">
                        <i class="fas fa-file-pdf" style="font-size:48px; color:#e74c3c;"></i>
                        <p>PDF generado correctamente</p>
                        <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                            <button id="shareWhatsAppBtn" class="btn-compartir" style="background:#0f0f0f; border:1px solid #25D366; border-radius:8px; padding:10px; cursor:pointer;"><i class="fab fa-whatsapp" style="color:#25D366;"></i> WhatsApp</button>
                            <button id="shareEmailBtn" class="btn-compartir" style="background:#0f0f0f; border:1px solid #0077B5; border-radius:8px; padding:10px; cursor:pointer;"><i class="fas fa-envelope" style="color:#0077B5;"></i> Correo</button>
                            <button id="shareLinkBtn" class="btn-compartir" style="background:#0f0f0f; border:1px solid var(--color-accent-primary); border-radius:8px; padding:10px; cursor:pointer;"><i class="fas fa-link"></i> Copiar enlace</button>
                            <button id="shareCancelBtn" class="btn-compartir" style="background:#0f0f0f; border:1px solid #aaa; border-radius:8px; padding:10px; cursor:pointer;">Cerrar</button>
                        </div>
                    </div>
                `,
                showConfirmButton: false, didOpen: () => {
                    const titulo = `INCIDENCIA: ${datos.sucursalNombre} - ${datos.categoriaNombre}`;
                    document.getElementById('shareWhatsAppBtn').onclick = () => {
                        Swal.close();
                        window.open(`https://wa.me/?text=${encodeURIComponent(`${titulo}\n\nPDF: ${pdfUrl}`)}`, '_blank');
                        resolve('whatsapp');
                    };
                    document.getElementById('shareEmailBtn').onclick = async () => {
                        Swal.close();
                        const { value: servicio } = await Swal.fire({ title: 'Servicio', input: 'select', inputOptions: { 'gmail':'Gmail','outlook':'Outlook' }, confirmButtonText: 'Abrir' });
                        if (servicio) {
                            const cuerpo = encodeURIComponent(`${titulo}\n\nPDF: ${pdfUrl}`);
                            const url = servicio === 'gmail' ? `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(titulo)}&body=${cuerpo}` : `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(titulo)}&body=${cuerpo}`;
                            window.open(url, '_blank');
                        }
                        resolve('email');
                    };
                    document.getElementById('shareLinkBtn').onclick = () => {
                        navigator.clipboard.writeText(pdfUrl);
                        Swal.close();
                        Swal.fire({ icon: 'success', title: 'Enlace copiado', timer: 1500, showConfirmButton: false });
                        resolve('link');
                    };
                    document.getElementById('shareCancelBtn').onclick = () => { Swal.close(); resolve('cancel'); };
                }
            });
        });
    }

    async _canalizarSucursal(incidenciaId, incidenciaTitulo = '') {
        const sucursalInput = document.getElementById('sucursalIncidencia');
        const sucursalId = sucursalInput?.dataset.selectedId;
        const sucursalNombre = sucursalInput?.value;
        if (!sucursalId) return null;
        try {
            Swal.fire({ title: 'Canalizando...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
            const res = await this.incidenciaManager.agregarCanalizacionSucursal(incidenciaId, sucursalId, sucursalNombre, this.usuarioActual.id, this.usuarioActual.nombreCompleto, 'Canalización desde creación', this.usuarioActual.organizacionCamelCase);
            Swal.close();
            if (res?.success) {
                await this._enviarNotificacionesSucursal([{ id: sucursalId, nombre: sucursalNombre }], incidenciaId, incidenciaTitulo);
                return { id: sucursalId, nombre: sucursalNombre };
            }
            throw new Error(res?.message || 'Error');
        } catch (error) {
            Swal.close();
            console.error(error);
            return null;
        }
    }

    async _enviarNotificacionesSucursal(sucursales, incidenciaId, incidenciaTitulo) {
        try {
            const manager = await this._initNotificacionSucursalManager();
            if (!manager) return;
            const sucursalInput = document.getElementById('sucursalIncidencia');
            const catInput = document.getElementById('categoriaIncidencia');
            const riesgoSelect = document.getElementById('nivelRiesgo');
            await manager.notificarMultiplesSucursales({
                sucursales: sucursales.map(s => ({ id: s.id, nombre: s.nombre })),
                incidenciaId, incidenciaTitulo: incidenciaTitulo || 'Incidencia',
                sucursalId: sucursalInput?.dataset.selectedId || '', sucursalNombre: sucursalInput?.value || '',
                categoriaId: catInput?.dataset.selectedId || '', categoriaNombre: catInput?.value || '',
                nivelRiesgo: riesgoSelect?.value || 'medio', tipo: 'canalizacion',
                prioridad: riesgoSelect?.value === 'critico' ? 'urgente' : 'normal',
                remitenteId: this.usuarioActual.id, remitenteNombre: this.usuarioActual.nombreCompleto,
                organizacionCamelCase: this.usuarioActual.organizacionCamelCase, enviarPush: true, incluirAdministradores: true
            });
        } catch (error) { console.error(error); }
    }

    async _canalizarAreas(incidenciaId, incidenciaTitulo = '') {
        let areasCanalizadas = [];
        let continuar = true;
        while (continuar) {
            const disponibles = {};
            this.areas.forEach(area => { if (!areasCanalizadas.some(a => a.id === area.id)) disponibles[area.id] = area.nombreArea; });
            if (!Object.keys(disponibles).length) break;
            const { value: areaId, isConfirmed } = await Swal.fire({
                title: areasCanalizadas.length ? 'Canalizar a otra área' : 'Selecciona un área',
                input: 'select', inputOptions: disponibles, showCancelButton: true,
                confirmButtonText: 'Canalizar', cancelButtonText: areasCanalizadas.length ? 'Finalizar' : 'Saltar'
            });
            if (!isConfirmed || !areaId) { continuar = false; break; }
            const area = this.areas.find(a => a.id === areaId);
            if (area) {
                try {
                    const res = await this.incidenciaManager.agregarCanalizacion(incidenciaId, area.id, area.nombreArea, this.usuarioActual.id, this.usuarioActual.nombreCompleto, 'Canalización desde creación', this.usuarioActual.organizacionCamelCase);
                    if (res?.success) {
                        areasCanalizadas.push({ id: area.id, nombre: area.nombreArea });
                        Swal.fire({ icon: 'success', title: 'Área agregada', timer: 1500, showConfirmButton: false });
                    } else throw new Error(res?.message);
                } catch (error) { console.error(error); Swal.fire({ icon: 'error', title: 'Error', text: error.message }); }
            }
        }
        if (areasCanalizadas.length) await this._enviarNotificacionesCanalizacion(areasCanalizadas, incidenciaId, incidenciaTitulo);
        return areasCanalizadas;
    }

    async _enviarNotificacionesCanalizacion(areas, incidenciaId, incidenciaTitulo) {
        try {
            const manager = await this._initNotificacionManager();
            if (!manager) return;
            const sucursalInput = document.getElementById('sucursalIncidencia');
            const catInput = document.getElementById('categoriaIncidencia');
            const riesgoSelect = document.getElementById('nivelRiesgo');
            await manager.notificarMultiplesAreas({
                areas: areas.map(a => ({ id: a.id, nombre: a.nombre })),
                incidenciaId, incidenciaTitulo: incidenciaTitulo || 'Incidencia',
                sucursalId: sucursalInput?.dataset.selectedId || '', sucursalNombre: sucursalInput?.value || '',
                categoriaId: catInput?.dataset.selectedId || '', categoriaNombre: catInput?.value || '',
                nivelRiesgo: riesgoSelect?.value || 'medio', tipo: 'canalizacion',
                prioridad: riesgoSelect?.value === 'critico' ? 'urgente' : 'normal',
                remitenteId: this.usuarioActual.id, remitenteNombre: this.usuarioActual.nombreCompleto,
                organizacionCamelCase: this.usuarioActual.organizacionCamelCase, enviarPush: true
            });
        } catch (error) { console.error(error); }
    }

    _volverALista() {
        this.imagenesSeleccionadas.forEach(img => URL.revokeObjectURL(img.preview));
        window.location.href = '../incidencias/incidencias.html';
    }

    _cancelarCreacion() {
        Swal.fire({ title: '¿Cancelar?', text: 'Los cambios se perderán', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí', cancelButtonText: 'No' }).then(res => {
            if (res.isConfirmed) { this.imagenesSeleccionadas.forEach(img => URL.revokeObjectURL(img.preview)); this._volverALista(); }
        });
    }

    _mostrarError(mensaje) { this._mostrarNotificacion(mensaje, 'error'); }
    _mostrarNotificacion(mensaje, tipo = 'info', duracion = 5000) {
        Swal.fire({ title: tipo === 'success' ? 'Éxito' : tipo === 'error' ? 'Error' : 'Información', text: mensaje, icon: tipo, timer: duracion, timerProgressBar: true, showConfirmButton: false });
    }
    _escapeHTML(text) { return String(text || '').replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }
    _getRiesgoTexto(riesgo) {
        if (this.nivelesRiesgoOptions?.length) {
            const nivel = this.nivelesRiesgoOptions.find(n => n.id === riesgo);
            if (nivel && nivel.id !== '__otro__') return nivel.nombre;
        }
        const map = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', critico: 'Crítico' };
        return map[riesgo] || riesgo;
    }
    _obtenerTipoEventoSeleccionado() {
        const btn = document.querySelector('.tipo-evento-btn.active');
        return btn ? btn.dataset.tipo : null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.crearIncidenciaDebug = { controller: new CrearIncidenciaController() };
});