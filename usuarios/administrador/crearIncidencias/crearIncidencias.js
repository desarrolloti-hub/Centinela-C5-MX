// crearIncidencias.js - VERSIÓN CORREGIDA
// SIN SweetAlert al agregar imágenes, SIN importaciones directas de Firebase en el controller

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
            this._inicializarValidacionSecuencial();
            this._configurarDragAndDropYPaste();

            this.imageEditorModal = new window.ImageEditorModal();

        } catch (error) {
            console.error('Error inicializando:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    _configurarDragAndDropYPaste() {
        const dropZone = document.getElementById('dropZone');
        const inputImagenes = document.getElementById('inputImagenes');
        
        if (!dropZone) {
            this._crearDropZone();
            return;
        }
        
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
            const files = Array.from(e.dataTransfer.files);
            const imageFiles = files.filter(file => file.type.startsWith('image/'));
            
            if (imageFiles.length > 0) {
                this._procesarImagenes(imageFiles);
            }
        });
        
        dropZone.addEventListener('click', () => {
            if (inputImagenes) {
                inputImagenes.click();
            }
        });
        
        document.addEventListener('paste', (e) => {
            this._manejarPegarImagen(e);
        });
        
    }

    _crearDropZone() {
        const imagenesContainer = document.querySelector('.imagenes-section');
        if (!imagenesContainer) return;
        
        const dropZoneHTML = `
            <div id="dropZone" class="drop-zone">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Arrastra y suelta imágenes aquí</p>
                <p class="small">o haz clic para seleccionar archivos</p>
                <p class="small text-muted mt-2">
                    <i class="fas fa-keyboard"></i> También puedes pegar imágenes con Ctrl+V
                </p>
            </div>
        `;
        
        const previewContainer = document.getElementById('imagenesPreview');
        if (previewContainer && previewContainer.parentNode) {
            previewContainer.insertAdjacentHTML('beforebegin', dropZoneHTML);
        } else {
            imagenesContainer.insertAdjacentHTML('beforeend', dropZoneHTML);
        }
        
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
                    const timestamp = Date.now();
                    const random = Math.random().toString(36).substring(2, 8);
                    const extension = file.type.split('/')[1] || 'png';
                    const fileName = `pasted_${timestamp}_${random}.${extension}`;
                    
                    const renamedFile = new File([file], fileName, { type: file.type });
                    imageFiles.push(renamedFile);
                }
            }
        }
        
        if (imageFiles.length > 0) {
            event.preventDefault();
            this._procesarImagenes(imageFiles);
        }
    }

    _inicializarValidacionSecuencial() {
        const camposDependientes = [
            { id: 'categoriaIncidencia', nombre: 'Categoría' },
            { id: 'nivelRiesgo', nombre: 'Nivel de Riesgo' },
            { id: 'subcategoriaIncidencia', nombre: 'Subcategoría' },
            { id: 'detallesIncidencia', nombre: 'Descripción' },
            { id: 'fechaHoraIncidencia', nombre: 'Fecha y Hora' }
        ];

        camposDependientes.forEach(campo => {
            const element = document.getElementById(campo.id);
            if (element) {
                element.disabled = true;
                element.classList.add('field-disabled');

                const parent = element.closest('.full-width');
                if (parent) {
                    let hint = parent.querySelector('.field-required-hint');
                    if (!hint) {
                        hint = document.createElement('div');
                        hint.className = 'field-required-hint';
                        hint.innerHTML = '<i class="fas fa-exclamation-circle"></i> Primero debes seleccionar una sucursal';
                        hint.style.color = 'var(--color-warning)';
                        hint.style.fontSize = '11px';
                        hint.style.marginTop = '5px';
                        hint.style.display = 'flex';
                        hint.style.alignItems = 'center';
                        hint.style.gap = '5px';
                        parent.appendChild(hint);
                    }
                }
            }

        });

        const sucursalInput = document.getElementById('sucursalIncidencia');
        if (sucursalInput) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-selected-id') {
                        const tieneSucursal = sucursalInput.dataset.selectedId && sucursalInput.dataset.selectedId !== '';
                        this._habilitarCamposPorSucursal(tieneSucursal);
                    }
                });
            });

            observer.observe(sucursalInput, { attributes: true });

            sucursalInput.addEventListener('blur', () => {
                const tieneSucursal = sucursalInput.dataset.selectedId && sucursalInput.dataset.selectedId !== '';
                this._habilitarCamposPorSucursal(tieneSucursal);
            });
        }
    }

    _habilitarCamposPorSucursal(habilitar) {
        const camposDependientes = [
            'categoriaIncidencia',
            'nivelRiesgo',
            'subcategoriaIncidencia',
            'detallesIncidencia',
            'fechaHoraIncidencia'
        ];

        camposDependientes.forEach(campoId => {
            const campo = document.getElementById(campoId);
            if (campo) {
                if (habilitar) {
                    campo.disabled = false;
                    campo.classList.remove('field-disabled');

                    const parent = campo.closest('.full-width');
                    const hint = parent?.querySelector('.field-required-hint');
                    if (hint) {
                        hint.style.display = 'none';
                    }
                } else {
                    campo.disabled = true;
                    campo.classList.add('field-disabled');
                    campo.value = campo.tagName === 'SELECT' ? '' : '';

                    const parent = campo.closest('.full-width');
                    const hint = parent?.querySelector('.field-required-hint');
                    if (hint) {
                        hint.style.display = 'flex';
                    }
                }
            }
        });

        if (!habilitar) {
            const categoriaInput = document.getElementById('categoriaIncidencia');
            if (categoriaInput) {
                delete categoriaInput.dataset.selectedId;
                delete categoriaInput.dataset.selectedName;
            }

            const subcategoriaSelect = document.getElementById('subcategoriaIncidencia');
            if (subcategoriaSelect) {
                subcategoriaSelect.innerHTML = '<option value="">-- Selecciona una subcategoría (opcional) --</option>';
            }

            this.categoriaSeleccionada = null;
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
                this._validarLongitudCampo(
                    detallesInput,
                    LIMITES.DETALLES_INCIDENCIA,
                    'Los detalles'
                );
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

            document.getElementById('btnAgregarImagen')?.addEventListener('click', () => {
                document.getElementById('inputImagenes').click();
            });

            document.getElementById('inputImagenes')?.addEventListener('change', (e) => this._procesarImagenes(e.target.files));

            document.getElementById('formIncidenciaPrincipal')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this._validarYGuardar();
            });

            document.getElementById('categoriaIncidencia')?.addEventListener('change', (e) => {
                const categoriaId = e.target.dataset.selectedId;
                if (categoriaId) {
                    this._cargarSubcategorias(categoriaId);
                }
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
                    document.getElementById('sugerenciasSucursal').innerHTML = '';
                }, 200);
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
                    document.getElementById('sugerenciasCategoria').innerHTML = '';
                }, 200);
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
                     data-nombre="${suc.nombre}">
                    <div class="sugerencia-icono">
                        <i class="fas fa-store"></i>
                    </div>
                    <div class="sugerencia-info">
                        <div class="sugerencia-nombre">${this._escapeHTML(suc.nombre)}</div>
                        <div class="sugerencia-detalle">
                            <i class="fas fa-map-marker-alt"></i>
                            ${suc.ciudad || 'Sin ciudad'} - ${suc.direccion || 'Sin dirección'}
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
                     data-nombre="${cat.nombre}">
                    <div class="sugerencia-icono">
                        <i class="fas fa-tag"></i>
                    </div>
                    <div class="sugerencia-info">
                        <div class="sugerencia-nombre">${this._escapeHTML(cat.nombre)}</div>
                        <div class="sugerencia-detalle">
                            <i class="fas fa-layer-group"></i>
                            ${totalSubcategorias} subcategorías
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

        document.getElementById('sugerenciasSucursal').innerHTML = '';

        this._habilitarCamposPorSucursal(true);
    }

    _seleccionarCategoria(id, nombre) {
        const input = document.getElementById('categoriaIncidencia');
        input.value = nombre;
        input.dataset.selectedId = id;
        input.dataset.selectedName = nombre;

        document.getElementById('sugerenciasCategoria').innerHTML = '';

        this._cargarSubcategorias(id);
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

    // MODIFICADO: SIN SweetAlert al agregar imágenes
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
                console.warn(`La imagen ${file.name} excede ${maxSize / 1024 / 1024}MB`);
                return false;
            }

            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!validTypes.includes(file.type)) {
                console.warn(`Formato no válido: ${file.name}. Usa JPG, PNG, GIF o WEBP`);
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
                    <p><strong>Sucursal:</strong> ${this._escapeHTML(sucursalNombre)}</p>
                    <p><strong>Categoría:</strong> ${this._escapeHTML(categoriaNombre)}</p>
                    ${subcategoriaId ? `<p><strong>Subcategoría:</strong> ${this._escapeHTML(subcategoriaNombre)}</p>` : ''}
                    <p><strong>Riesgo:</strong> ${this._getRiesgoTexto(nivelRiesgo)}</p>
                    <p><strong>Estado:</strong> ${estado === 'pendiente' ? 'Pendiente' : 'Finalizada'}</p>
                    <p><strong>Fecha:</strong> ${new Date(fechaHora).toLocaleString('es-MX')}</p>
                    <p><strong>Evidencias:</strong> ${this.imagenesSeleccionadas.length} imagen(es)</p>
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save"></i> Crear',
            cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
            confirmButtonColor: '#28a745',
            cancelButtonColor: '#6c757d'
        });

        if (result.isConfirmed) {
            Swal.fire({
                title: 'Generando PDF...',
                text: 'Preparando el documento para descargar',
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => Swal.showLoading()
            });

            const incidenciaTemporal = this._crearRegistroTemporal(datos);
            let pdfBlob = null;

            try {
                pdfBlob = await this.pdfGenerator.generarIPH(incidenciaTemporal, {
                    mostrarAlerta: false,
                    returnBlob: true,
                    diagnosticar: false
                });
                
                const pdfUrl = URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = pdfUrl;
                const fechaParaNombre = new Date(datos.fechaHora).toISOString().slice(0, 19).replace(/:/g, '-');
                link.download = `incidencia_${datos.sucursalNombre}_${fechaParaNombre}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(pdfUrl);
                
                Swal.close();
            } catch (pdfError) {
                console.error('Error generando PDF:', pdfError);
                Swal.close();
                this._mostrarError('No se pudo generar el PDF, pero continuaremos con el guardado');
            }
            
            await this._guardarIncidencia(datos);
        }
    }

    async _guardarIncidencia(datos) {
        const btnCrear = document.getElementById('btnCrearIncidencia');
        const originalHTML = btnCrear ? btnCrear.innerHTML : '<i class="fas fa-check me-2"></i>Crear Incidencia';

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
            
            
            // SUBIR IMÁGENES SOLO SI HAY (OPCIONAL)
            let imagenesSubidas = [];

            if (datos.imagenes && datos.imagenes.length > 0) {
                Swal.update({
                    title: 'Subiendo imágenes...',
                    text: `Subiendo ${datos.imagenes.length} imagen(es)...`
                });
                
                const uploadPromises = datos.imagenes.map(async (img, index) => {
                    const rutaStorage = `incidencias_${this.usuarioActual.organizacionCamelCase}/${nuevaIncidencia.id}/imagenes/${img.generatedName}`;
                    const resultado = await this.incidenciaManager.subirArchivo(img.file, rutaStorage);
                    
                    return {
                        url: resultado.url,
                        path: resultado.path,
                        comentario: img.comentario || '',
                        elementos: img.elementos || [],
                        nombre: img.file.name,
                        generatedName: img.generatedName,
                        tipo: img.file.type,
                        tamaño: img.file.size
                    };
                });
                
                imagenesSubidas = await Promise.all(uploadPromises);
                
                // Actualizar Firestore con las URLs de las imágenes
                await this.incidenciaManager.actualizarImagenes(
                    nuevaIncidencia.id,
                    imagenesSubidas,
                    this.usuarioActual.organizacionCamelCase,
                    this.usuarioActual.id,
                    this.usuarioActual.nombreCompleto
                );
                
                nuevaIncidencia.imagenes = imagenesSubidas;
            } else {
                // Sin imágenes, asignar array vacío
                nuevaIncidencia.imagenes = [];
            }

            // SUBIR PDF SOLO SI SE GENERÓ CORRECTAMENTE
            if (pdfBlob && pdfBlob.size > 0) {
                Swal.update({
                    title: 'Subiendo PDF...',
                    text: 'Guardando el documento PDF...'
                });
                
                const pdfFile = new File([pdfBlob], `incidencia_${nuevaIncidencia.id}.pdf`, { type: 'application/pdf' });
                const rutaPDF = `incidencias_${this.usuarioActual.organizacionCamelCase}/${nuevaIncidencia.id}/pdf/incidencia_${nuevaIncidencia.id}.pdf`;
                
                const resultadoPDF = await this.incidenciaManager.subirArchivo(pdfFile, rutaPDF);
                
                await this.incidenciaManager.actualizarPDF(
                    nuevaIncidencia.id,
                    resultadoPDF.url,
                    this.usuarioActual.organizacionCamelCase,
                    this.usuarioActual.id,
                    this.usuarioActual.nombreCompleto
                );
            }
            
            // Subir PDF
            Swal.update({
                title: 'Subiendo PDF...',
                text: 'Guardando el documento PDF...'
            });
            
            const pdfFile = new File([pdfBlob], `incidencia_${nuevaIncidencia.id}.pdf`, { type: 'application/pdf' });
            const rutaPDF = `incidencias_${this.usuarioActual.organizacionCamelCase}/${nuevaIncidencia.id}/pdf/incidencia_${nuevaIncidencia.id}.pdf`;
            
            const resultadoPDF = await this.incidenciaManager.subirArchivo(pdfFile, rutaPDF);
            
            await this.incidenciaManager.actualizarPDF(
            nuevaIncidencia.id,
            resultadoPDF.url,
            this.usuarioActual.organizacionCamelCase,
            this.usuarioActual.id,
            this.usuarioActual.nombreCompleto
        );
            
            
            Swal.close();
            
            // Canalización a sucursal
            let sucursalCanalizada = null;
            let areasCanalizadas = [];
            
            const quiereCanalizarSucursal = await Swal.fire({
                icon: 'question',
                title: '¿Canalizar a la sucursal?',
                text: '¿Deseas canalizar esta incidencia a la sucursal seleccionada?',
                showCancelButton: true,
                confirmButtonText: 'SÍ, CANALIZAR',
                cancelButtonText: 'NO, CONTINUAR',
                confirmButtonColor: '#28a745'
            });
            
            if (quiereCanalizarSucursal.isConfirmed) {
                sucursalCanalizada = await this._canalizarSucursal(nuevaIncidencia.id, datos.detalles.substring(0, 50));
            }
            
            const quiereCanalizarArea = await Swal.fire({
                icon: 'question',
                title: '¿Canalizar a área(s)?',
                text: '¿Deseas canalizar esta incidencia a alguna área adicional?',
                showCancelButton: true,
                confirmButtonText: 'SÍ, CANALIZAR A ÁREA',
                cancelButtonText: 'NO, FINALIZAR',
                confirmButtonColor: '#28a745'
            });
            
            if (quiereCanalizarArea.isConfirmed) {
                areasCanalizadas = await this._canalizarAreas(nuevaIncidencia.id, datos.detalles.substring(0, 50));
            }
            
            const tieneSucursal = sucursalCanalizada !== null;
            const totalAreas = areasCanalizadas.length;
            
            let mensajeCanalizacion = '';
            if (tieneSucursal && totalAreas > 0) {
                mensajeCanalizacion = `Canalizada a sucursal ${sucursalCanalizada.nombre} y ${totalAreas} área(s).`;
            } else if (tieneSucursal) {
                mensajeCanalizacion = `Canalizada a sucursal ${sucursalCanalizada.nombre}.`;
            } else if (totalAreas > 0) {
                mensajeCanalizacion = `Canalizada a ${totalAreas} área(s).`;
            } else {
                mensajeCanalizacion = 'No se canalizó a ninguna sucursal o área.';
            }
            
            await Swal.fire({
                icon: 'success',
                title: '¡Incidencia creada!',
                html: `
                    <div style="text-align: left;">
                        <p>Incidencia guardada ${nuevaIncidencia.imagenes?.length > 0 ? `con ${nuevaIncidencia.imagenes.length} imagen(es)` : 'sin imágenes'}.</p>
                        ${pdfBlob && pdfBlob.size > 0 ? '<p>El PDF se ha generado correctamente.</p>' : '<p>No se pudo generar el PDF, pero la incidencia se guardó.</p>'}
                        <p>${mensajeCanalizacion}</p>
                    </div>
                `,
                confirmButtonText: 'Ver incidencias',
                confirmButtonColor: '#28a745'
            });
            
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
        
        if (!sucursalId || !sucursalNombre) {
            console.warn('No hay sucursal seleccionada para canalizar');
            return null;
        }
        
        Swal.fire({
            title: 'Canalizando...',
            html: '<i class="fas fa-spinner fa-spin"></i>',
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading()
        });
        
        try {
            const resultado = await this.incidenciaManager.agregarCanalizacionSucursal(
                incidenciaId,
                sucursalId,
                sucursalNombre,
                this.usuarioActual.id,
                this.usuarioActual.nombreCompleto,
                'Canalización desde creación',
                this.usuarioActual.organizacionCamelCase
            );
            
            Swal.close();
            
            if (resultado && resultado.success) {
                await Swal.fire({
                    icon: 'success',
                    title: 'Canalizada',
                    text: `La incidencia ha sido canalizada a ${sucursalNombre}`,
                    timer: 2000,
                    showConfirmButton: false
                });
                
                await this._enviarNotificacionesSucursal([{
                    id: sucursalId,
                    nombre: sucursalNombre
                }], incidenciaId, incidenciaTitulo);
                
                return {
                    id: sucursalId,
                    nombre: sucursalNombre
                };
            } else {
                throw new Error(resultado?.message || 'Error al guardar canalización');
            }
            
        } catch (error) {
            Swal.close();
            console.error('Error guardando canalización a sucursal:', error);
            await Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message || 'No se pudo canalizar a la sucursal'
            });
            return null;
        }
    }

    async _enviarNotificacionesSucursal(sucursales, incidenciaId, incidenciaTitulo) {
        try {
            const notificacionSucursalManager = await this._initNotificacionSucursalManager();

            if (!notificacionSucursalManager) {
                console.error('No se pudo inicializar notificacionSucursalManager');
                return;
            }

            const sucursalInput = document.getElementById('sucursalIncidencia');
            const categoriaInput = document.getElementById('categoriaIncidencia');
            const riesgoSelect = document.getElementById('nivelRiesgo');

            const sucursalesFormateadas = sucursales.map(suc => ({
                id: suc.id,
                nombre: suc.nombre
            }));

            Swal.fire({
                title: 'Enviando notificaciones...',
                text: 'Notificando a colaboradores de las sucursales y administradores',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const resultado = await notificacionSucursalManager.notificarMultiplesSucursales({
                sucursales: sucursalesFormateadas,
                incidenciaId: incidenciaId,
                incidenciaTitulo: incidenciaTitulo || 'Incidencia',
                sucursalId: sucursalInput?.dataset.selectedId || '',
                sucursalNombre: sucursalInput?.value || '',
                categoriaId: categoriaInput?.dataset.selectedId || '',
                categoriaNombre: categoriaInput?.value || '',
                nivelRiesgo: riesgoSelect?.value || 'medio',
                tipo: 'canalizacion',
                prioridad: riesgoSelect?.value === 'critico' ? 'urgente' : 'normal',
                remitenteId: this.usuarioActual.id,
                remitenteNombre: this.usuarioActual.nombreCompleto,
                organizacionCamelCase: this.usuarioActual.organizacionCamelCase,
                enviarPush: true,
                incluirAdministradores: true
            });

            Swal.close();

            if (resultado.success) {
                let mensaje = `Notificaciones enviadas:`;
                mensaje += `<br>${resultado.totalColaboradores} colaboradores en ${resultado.sucursales} sucursales`;
                mensaje += `<br>${resultado.totalAdministradores} administradores`;
                
                if (resultado.push && resultado.push.enviados > 0) {
                    mensaje += `<br>📱 Push: ${resultado.push.enviados}/${resultado.push.total} enviados`;
                }
                
                await Swal.fire({
                    icon: 'success',
                    title: 'Notificaciones enviadas',
                    html: mensaje,
                    timer: 4000,
                    showConfirmButton: false
                });
            } else {
                console.error('Error:', resultado.error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudieron enviar las notificaciones'
                });
            }

        } catch (error) {
            console.error('Error en _enviarNotificacionesSucursal:', error);
            Swal.close();
        }
    }

    async _canalizarAreas(incidenciaId, incidenciaTitulo = '') {
        let continuar = true;
        let areasCanalizadas = [];

        while (continuar) {
            const areaOptions = {};
            this.areas.forEach(area => {
                if (!areasCanalizadas.some(a => a.id === area.id)) {
                    areaOptions[area.id] = area.nombreArea;
                }
            });
            
            if (Object.keys(areaOptions).length === 0) {
                await Swal.fire({
                    icon: 'info',
                    title: 'No hay más áreas',
                    text: 'Ya has canalizado a todas las áreas disponibles',
                    timer: 2000,
                    showConfirmButton: false
                });
                break;
            }

            const { value: areaId, isConfirmed } = await Swal.fire({
                title: areasCanalizadas.length === 0 ? '¿Canalizar a un área?' : 'Canalizar a otra área',
                text: areasCanalizadas.length === 0
                    ? 'Selecciona el área a la que deseas canalizar esta incidencia'
                    : `Áreas actuales: ${areasCanalizadas.map(a => a.nombre).join(', ')}\n\nSelecciona otra área (o cancela para terminar)`,
                input: 'select',
                inputOptions: areaOptions,
                inputPlaceholder: 'Selecciona un área',
                showCancelButton: true,
                confirmButtonText: 'CANALIZAR',
                cancelButtonText: areasCanalizadas.length === 0 ? 'NO CANALIZAR' : 'FINALIZAR',
                confirmButtonColor: '#28a745',
                inputValidator: (value) => {
                    if (!value) {
                        return 'Debes seleccionar un área';
                    }
                }
            });

            if (!isConfirmed) {
                continuar = false;
                break;
            }

            if (areaId) {
                const area = this.areas.find(a => a.id === areaId);
                if (area) {
                    areasCanalizadas.push({
                        id: area.id,
                        nombre: area.nombreArea
                    });

                    try {
                        const resultado = await this.incidenciaManager.agregarCanalizacion(
                            incidenciaId,
                            area.id,
                            area.nombreArea,
                            this.usuarioActual.id,
                            this.usuarioActual.nombreCompleto,
                            'Canalización desde creación',
                            this.usuarioActual.organizacionCamelCase
                        );

                        if (resultado && resultado.success) {
                            await Swal.fire({
                                icon: 'success',
                                title: 'Área agregada',
                                text: `La incidencia ha sido canalizada a ${area.nombreArea}`,
                                timer: 1500,
                                showConfirmButton: false
                            });
                        } else {
                            throw new Error(resultado?.message || 'Error al guardar canalización');
                        }

                    } catch (error) {
                        console.error('Error guardando canalización:', error);
                        await Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: error.message || 'No se pudo canalizar a esta área'
                        });
                    }
                }
            }
        }

        if (areasCanalizadas.length > 0) {
            await this._enviarNotificacionesCanalizacion(areasCanalizadas, incidenciaId, incidenciaTitulo);
        }

        return areasCanalizadas;
    }

    async _enviarNotificacionesCanalizacion(areas, incidenciaId, incidenciaTitulo) {
        try {
            const notificacionManager = await this._initNotificacionManager();

            if (!notificacionManager) {
                console.error('No se pudo inicializar notificacionManager');
                return;
            }

            const sucursalInput = document.getElementById('sucursalIncidencia');
            const categoriaInput = document.getElementById('categoriaIncidencia');
            const riesgoSelect = document.getElementById('nivelRiesgo');

            const areasFormateadas = areas.map(area => ({
                id: area.id,
                nombre: area.nombre
            }));

            Swal.fire({
                title: 'Enviando notificaciones...',
                text: 'Notificando a colaboradores de las áreas y administradores',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const resultado = await notificacionManager.notificarMultiplesAreas({
                areas: areasFormateadas,
                incidenciaId: incidenciaId,
                incidenciaTitulo: incidenciaTitulo || 'Incidencia',
                sucursalId: sucursalInput?.dataset.selectedId || '',
                sucursalNombre: sucursalInput?.value || '',
                categoriaId: categoriaInput?.dataset.selectedId || '',
                categoriaNombre: categoriaInput?.value || '',
                nivelRiesgo: riesgoSelect?.value || 'medio',
                tipo: 'canalizacion',
                prioridad: riesgoSelect?.value === 'critico' ? 'urgente' : 'normal',
                remitenteId: this.usuarioActual.id,
                remitenteNombre: this.usuarioActual.nombreCompleto,
                organizacionCamelCase: this.usuarioActual.organizacionCamelCase,
                enviarPush: true
            });

            Swal.close();

            if (resultado.success) {
                let mensaje = `Notificaciones enviadas:`;
                mensaje += `<br> ${resultado.totalColaboradores} colaboradores en ${resultado.areas} áreas`;
                mensaje += `<br> ${resultado.totalAdministradores} administradores`;

                if (resultado.push && resultado.push.enviados > 0) {
                    mensaje += `<br>📱 Push: ${resultado.push.enviados}/${resultado.push.total} enviados`;
                }

                Swal.fire({
                    icon: 'success',
                    title: 'Notificaciones enviadas',
                    html: mensaje,
                    timer: 4000,
                    showConfirmButton: false
                });
            } else {
                console.error('Error:', resultado.error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudieron enviar las notificaciones'
                });
            }

        } catch (error) {
            console.error('Error en _enviarNotificacionesCanalizacion:', error);
            Swal.close();
        }
    }

    _volverALista() {
        this.imagenesSeleccionadas.forEach(img => {
            if (img.preview) {
                URL.revokeObjectURL(img.preview);
            }
        });
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
                this.imagenesSeleccionadas.forEach(img => {
                    if (img.preview) {
                        URL.revokeObjectURL(img.preview);
                    }
                });
                this._volverALista();
            }
        });
    }

    _mostrarError(mensaje) {
        this._mostrarNotificacion(mensaje, 'error');
    }

    _mostrarNotificacion(mensaje, tipo = 'info', duracion = 5000) {
        Swal.fire({
            title: tipo === 'success' ? 'Éxito' :
                tipo === 'error' ? 'Error' :
                    tipo === 'warning' ? 'Advertencia' : 'Información',
            text: mensaje,
            icon: tipo,
            timer: duracion,
            timerProgressBar: true,
            showConfirmButton: false
        });
    }

    _escapeHTML(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    _mostrarCargando(mensaje = 'Guardando...') {
        if (this.loadingOverlay) {
            this.loadingOverlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="spinner"></div>
            <div class="loading-text">${mensaje}</div>
        `;

        document.body.appendChild(overlay);
        this.loadingOverlay = overlay;
    }

    _ocultarCargando() {
        if (this.loadingOverlay) {
            this.loadingOverlay.remove();
            this.loadingOverlay = null;
        }
    }
}

// FORMULARIO SECUENCIAL
function inicializarFormularioSecuencial() {
    let pasoActual = 0;
    const totalPasos = 7;
    const campos = document.querySelectorAll('.field-group-step');
    const seccionImagenes = document.getElementById('seccionImagenesWrapper');
    const botonesContainer = document.getElementById('originalButtons');

    campos.forEach(campo => {
        campo.classList.remove('visible');
    });

    if (campos[0]) {
        campos[0].classList.add('visible');
    }

    function verificarBotonesFinales() {
        const sucursalValida = document.getElementById('sucursalIncidencia')?.dataset.selectedId && 
                               document.getElementById('sucursalIncidencia')?.value.trim() !== '';
        const categoriaValida = document.getElementById('categoriaIncidencia')?.dataset.selectedId && 
                                document.getElementById('categoriaIncidencia')?.value.trim() !== '';
        const riesgoValido = document.getElementById('nivelRiesgo')?.value !== '';
        const estadoValido = document.getElementById('estadoIncidencia')?.value !== '';
        const fechaValida = (() => {
            const fechaValor = document.getElementById('fechaHoraIncidencia')?.value;
            if (!fechaValor) return false;
            const fecha = new Date(fechaValor);
            return !isNaN(fecha.getTime()) && fecha <= new Date();
        })();
        const descripcionValida = (() => {
            const texto = document.getElementById('detallesIncidencia')?.value.trim() || '';
            return texto.length >= 10 && texto.length <= 1000;
        })();

        const todoCompleto = sucursalValida && categoriaValida && riesgoValido && 
                             estadoValido && fechaValida && descripcionValida;

        if (todoCompleto && seccionImagenes && botonesContainer) {
            seccionImagenes.classList.add('visible');
            botonesContainer.style.display = 'flex';
        } else if (botonesContainer) {
            botonesContainer.style.display = 'none';
            if (seccionImagenes) seccionImagenes.classList.remove('visible');
        }
    }

    function validarYMostrarSiguiente(stepIndex) {
        if (stepIndex !== pasoActual) return;

        let esValido = false;

        switch (stepIndex) {
            case 0:
                const sucursalInput = document.getElementById('sucursalIncidencia');
                esValido = sucursalInput?.dataset.selectedId && sucursalInput.value.trim() !== '';
                break;
            case 1:
                const catInput = document.getElementById('categoriaIncidencia');
                esValido = catInput?.dataset.selectedId && catInput.value.trim() !== '';
                break;
            case 2:
                esValido = true;
                break;
            case 3:
                esValido = document.getElementById('nivelRiesgo')?.value !== '';
                break;
            case 4:
                esValido = document.getElementById('estadoIncidencia')?.value !== '';
                break;
            case 5:
                const fechaValor = document.getElementById('fechaHoraIncidencia')?.value;
                if (!fechaValor) {
                    esValido = false;
                } else {
                    const fecha = new Date(fechaValor);
                    esValido = !isNaN(fecha.getTime()) && fecha <= new Date();
                }
                break;
            case 6:
                const texto = document.getElementById('detallesIncidencia')?.value.trim() || '';
                esValido = texto.length >= 10 && texto.length <= 1000;
                break;
        }

        if (esValido && pasoActual < totalPasos - 1) {
            const siguienteIndex = pasoActual + 1;
            const siguienteCampo = document.querySelector(`.field-group-step[data-step="${siguienteIndex}"]`);
            if (siguienteCampo) {
                siguienteCampo.classList.add('visible');
                pasoActual = siguienteIndex;

                setTimeout(() => {
                    const nuevoInput = siguienteCampo.querySelector('input, select, textarea');
                    if (nuevoInput) nuevoInput.focus();
                }, 100);
            }
        }

        verificarBotonesFinales();
    }

    function configurarEventosSecuenciales() {
        const sucursalInput = document.getElementById('sucursalIncidencia');
        if (sucursalInput) {
            const observer = new MutationObserver(() => validarYMostrarSiguiente(0));
            observer.observe(sucursalInput, { attributes: true, attributeFilter: ['data-selected-id'] });
            sucursalInput.addEventListener('blur', () => validarYMostrarSiguiente(0));
        }

        const categoriaInput = document.getElementById('categoriaIncidencia');
        if (categoriaInput) {
            const observer = new MutationObserver(() => validarYMostrarSiguiente(1));
            observer.observe(categoriaInput, { attributes: true, attributeFilter: ['data-selected-id'] });
            categoriaInput.addEventListener('blur', () => validarYMostrarSiguiente(1));
        }

        const subcatSelect = document.getElementById('subcategoriaIncidencia');
        if (subcatSelect) {
            subcatSelect.addEventListener('change', () => validarYMostrarSiguiente(2));
        }

        const riesgoSelect = document.getElementById('nivelRiesgo');
        if (riesgoSelect) {
            riesgoSelect.addEventListener('change', () => validarYMostrarSiguiente(3));
        }

        const estadoSelect = document.getElementById('estadoIncidencia');
        if (estadoSelect) {
            estadoSelect.addEventListener('change', () => validarYMostrarSiguiente(4));
        }

        const fechaInput = document.getElementById('fechaHoraIncidencia');
        if (fechaInput) {
            fechaInput.addEventListener('change', () => validarYMostrarSiguiente(5));
        }

        const detallesTextarea = document.getElementById('detallesIncidencia');
        if (detallesTextarea) {
            detallesTextarea.addEventListener('input', () => validarYMostrarSiguiente(6));
        }
    }

    configurarEventosSecuenciales();
    verificarBotonesFinales();
}

setTimeout(() => {
    inicializarFormularioSecuencial();
}, 500);

document.addEventListener('DOMContentLoaded', () => {
    window.crearIncidenciaDebug = { controller: new CrearIncidenciaController() };
});