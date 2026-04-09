window.editarSucursalDebug = {
    estado: 'iniciando',
    controller: null
};

let historialManager = null; // ✅ NUEVO: Para registrar actividades

// LÍMITES DE CARACTERES
const LIMITES = {
    NOMBRE_SUCURSAL: 100,
    TIPO_SUCURSAL: 50,
    CIUDAD: 50,
    DIRECCION: 200,
    ZONA: 30,
    CONTACTO: 10,
    COORDENADA: 20
};

// =============================================
// CLASE PRINCIPAL - EditarSucursalController
// =============================================
class EditarSucursalController {
    constructor() {
        this.sucursalManager = null;
        this.regionManager = null;
        this.usuarioActual = null;
        this.sucursalActual = null;
        this.sucursalOriginal = null; // ✅ NUEVO: Copia original para comparar cambios
        this.loadingOverlay = null;
        this.notificacionActual = null;

        // Propiedades del mapa
        this.map = null;
        this.marker = null;
        this.mapInitialized = false;

        // Timeout para debounce del listener de coordenadas
        this.coordenadasTimeout = null;

        // Bandera para evitar loops infinitos
        this.actualizandoDesdeMapa = false;

        // Inicializar
        this._init();
    }

    // ========== INICIALIZACIÓN ==========
    async _init() {
        try {
            // 1. Cargar usuario
            this._cargarUsuario();

            if (!this.usuarioActual) {
                console.warn('No hay usuario autenticado, usando valores por defecto');
                this.usuarioActual = {
                    id: `usuario_${Date.now()}`,
                    uid: `usuario_${Date.now()}`,
                    nombreCompleto: 'Usuario',
                    organizacion: 'Mi Organización',
                    organizacionCamelCase: 'miOrganizacion',
                    correo: 'usuario@ejemplo.com'
                };
            }

            // 2. Inicializar historialManager
            await this._initHistorial();

            // 3. Obtener ID de la URL
            const urlParams = new URLSearchParams(window.location.search);
            const sucursalId = urlParams.get('id');
            const orgFromUrl = urlParams.get('org');

            if (!sucursalId) {
                throw new Error('No se especificó la sucursal a editar');
            }

            // Si hay orgFromUrl, usarla para determinar la organización
            if (orgFromUrl) {
                this.usuarioActual.organizacionCamelCase = orgFromUrl;
            }

            this.sucursalId = sucursalId;

            // 4. Cargar managers
            await this._cargarManagers();

            // 5. Cargar regiones
            await this._cargarRegiones();

            // 6. Cargar estados de México
            this._cargarEstados();

            // 7. Cargar datos de la sucursal
            await this._cargarDatosSucursal();

            // 8. Aplicar límites de caracteres
            this._aplicarLimitesCaracteres();

            // 9. Configurar listener de coordenadas
            this._configurarListenerCoordenadas();

            // 10. Configurar eventos
            this._configurarEventos();

            // 11. Inicializar mapa (después de cargar los datos)
            setTimeout(() => this._inicializarMapa(), 1000);

            window.editarSucursalDebug.controller = this;

        } catch (error) {
            console.error('Error inicializando:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
            // NO redirigir automáticamente
        }
    }

    // ✅ NUEVO: Inicializar historialManager
    async _initHistorial() {
        try {
            const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
            historialManager = new HistorialUsuarioManager();
            console.log('📋 HistorialManager inicializado para editar sucursales');
        } catch (error) {
            console.error('Error inicializando historialManager:', error);
        }
    }

    // ✅ NUEVO: Registrar edición de sucursal
    async _registrarEdicionSucursal(sucursalOriginal, sucursalActualizada, cambios) {
        if (!historialManager) return;

        try {
            // Obtener nombre de la región
            let regionNombre = '';
            if (sucursalActualizada.regionId) {
                try {
                    const region = await this.regionManager.getRegionById(
                        sucursalActualizada.regionId,
                        this.usuarioActual.organizacionCamelCase
                    );
                    regionNombre = region?.nombre || 'No especificada';
                } catch (e) {
                    regionNombre = 'No especificada';
                }
            }

            await historialManager.registrarActividad({
                usuario: this.usuarioActual,
                tipo: 'editar',
                modulo: 'sucursales',
                descripcion: `Editó sucursal: ${sucursalActualizada.nombre}`,
                detalles: {
                    sucursalId: sucursalActualizada.id,
                    sucursalNombreOriginal: sucursalOriginal.nombre,
                    sucursalNombreActualizado: sucursalActualizada.nombre,
                    regionId: sucursalActualizada.regionId,
                    regionNombre: regionNombre,
                    cambios: cambios,
                    fechaEdicion: new Date().toISOString()
                }
            });
            console.log(`✅ Edición de sucursal "${sucursalOriginal.nombre}" registrada en bitácora`);
        } catch (error) {
            console.error('Error registrando edición de sucursal:', error);
        }
    }

    // ========== CARGA DE DEPENDENCIAS ==========
    async _cargarManagers() {
        try {
            const { SucursalManager, ESTADOS_MEXICO } = await import('/clases/sucursal.js');
            const { RegionManager } = await import('/clases/region.js');

            this.sucursalManager = new SucursalManager();
            this.regionManager = new RegionManager();
            this.ESTADOS_MEXICO = ESTADOS_MEXICO;

        } catch (error) {
            console.error('Error cargando managers:', error);
            throw error;
        }
    }

    // ========== CARGA DE USUARIO ==========
    _cargarUsuario() {
        try {
            // Intentar obtener usuario del localStorage
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
                    correo: adminData.correoElectronico || ''
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

            // Si no hay datos, retornar null (se usarán valores por defecto en _init)
            this.usuarioActual = null;

        } catch (error) {
            console.error('Error cargando usuario:', error);
            this.usuarioActual = null;
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

    // ========== APLICAR LÍMITES DE CARACTERES ==========
    _aplicarLimitesCaracteres() {
        const campos = [
            { id: 'nombreSucursal', limite: LIMITES.NOMBRE_SUCURSAL, nombre: 'Nombre de la sucursal' },
            { id: 'tipoSucursal', limite: LIMITES.TIPO_SUCURSAL, nombre: 'Tipo de sucursal' },
            { id: 'zonaSucursal', limite: LIMITES.ZONA, nombre: 'Zona' },
            { id: 'ciudadSucursal', limite: LIMITES.CIUDAD, nombre: 'Ciudad' },
            { id: 'direccionSucursal', limite: LIMITES.DIRECCION, nombre: 'Dirección' },
            { id: 'contactoSucursal', limite: LIMITES.CONTACTO, nombre: 'Contacto' },
            { id: 'latitudSucursal', limite: LIMITES.COORDENADA, nombre: 'Latitud' },
            { id: 'longitudSucursal', limite: LIMITES.COORDENADA, nombre: 'Longitud' }
        ];

        campos.forEach(campo => {
            const input = document.getElementById(campo.id);
            if (input) {
                input.maxLength = campo.limite;
                input.addEventListener('input', () => this._validarLongitudCampo(input, campo.limite, campo.nombre));
            }
        });

        // Validación especial para teléfono (solo números)
        const contactoInput = document.getElementById('contactoSucursal');
        if (contactoInput) {
            contactoInput.addEventListener('input', (e) => {
                let valor = e.target.value.replace(/\D/g, '');
                if (valor.length > LIMITES.CONTACTO) {
                    valor = valor.substring(0, LIMITES.CONTACTO);
                }
                e.target.value = valor;
            });
        }
    }

    _validarLongitudCampo(campo, limite, nombreCampo) {
        const longitud = campo.value.length;
        if (longitud > limite) {
            campo.value = campo.value.substring(0, limite);
            this._mostrarNotificacion(`${nombreCampo} no puede exceder ${limite} caracteres`, 'warning', 3000);
        }
    }

    // ========== CARGA DE REGIONES ==========
    async _cargarRegiones() {
        try {
            const regiones = await this.regionManager.getRegionesByOrganizacion(
                this.usuarioActual.organizacionCamelCase
            );

            const select = document.getElementById('regionSucursal');
            if (!select) return;

            select.innerHTML = '<option value="">-- Seleccione una región --</option>';

            if (regiones.length === 0) {
                select.innerHTML = '<option value="">-- No hay regiones disponibles --</option>';
                return;
            }

            regiones.forEach(region => {
                const option = document.createElement('option');
                option.value = region.id;
                option.textContent = region.nombre;
                option.setAttribute('data-region-nombre', region.nombre);
                select.appendChild(option);
            });

        } catch (error) {
            console.error('Error cargando regiones:', error);
            const select = document.getElementById('regionSucursal');
            if (select) {
                select.innerHTML = '<option value="">-- Error cargando regiones --</option>';
            }
        }
    }

    _cargarEstados() {
        const select = document.getElementById('estadoSucursal');
        if (!select || !this.ESTADOS_MEXICO) return;

        select.innerHTML = '<option value="">-- Seleccione un estado --</option>';

        this.ESTADOS_MEXICO.forEach(estado => {
            const option = document.createElement('option');
            option.value = estado;
            option.textContent = estado;
            select.appendChild(option);
        });
    }

    // ========== CARGA DE DATOS DE SUCURSAL ==========
    async _cargarDatosSucursal() {
        try {
            this._mostrarCargando('Cargando datos de la sucursal...');

            const sucursal = await this.sucursalManager.getSucursalById(
                this.sucursalId,
                this.usuarioActual.organizacionCamelCase
            );

            if (!sucursal) {
                throw new Error('No se encontró la sucursal especificada');
            }

            this.sucursalActual = sucursal;
            // ✅ NUEVO: Guardar copia original para comparar cambios
            this.sucursalOriginal = JSON.parse(JSON.stringify(sucursal));

            // Llenar campos del formulario
            this._llenarFormulario(sucursal);

            this._ocultarCargando();

        } catch (error) {
            this._ocultarCargando();
            console.error('Error cargando datos de sucursal:', error);
            throw error;
        }
    }

    _llenarFormulario(sucursal) {
        // Campos principales
        this._setValue('sucursalId', sucursal.id);
        this._setValue('organizacionCamelCase', sucursal.organizacionCamelCase);
        this._setValue('nombreSucursal', sucursal.nombre || '');
        this._setValue('tipoSucursal', sucursal.tipo || '');

        // Ubicación (campos directos)
        this._setValue('zonaSucursal', sucursal.zona || '');
        this._setValue('ciudadSucursal', sucursal.ciudad || '');
        this._setValue('direccionSucursal', sucursal.direccion || '');

        // Contacto
        this._setValue('contactoSucursal', sucursal.contacto || '');

        // Coordenadas (campos directos)
        this._setValue('latitudSucursal', sucursal.latitud || '');
        this._setValue('longitudSucursal', sucursal.longitud || '');

        // Seleccionar región (con timeout para esperar que carguen las opciones)
        if (sucursal.regionId) {
            setTimeout(() => {
                const regionSelect = document.getElementById('regionSucursal');
                if (regionSelect) {
                    regionSelect.value = sucursal.regionId;
                }
            }, 500);
        }

        // Seleccionar estado
        if (sucursal.estado) {
            setTimeout(() => {
                const estadoSelect = document.getElementById('estadoSucursal');
                if (estadoSelect) {
                    estadoSelect.value = sucursal.estado;
                }
            }, 100);
        }
    }

    _setValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value || '';
        }
    }

    // ========== LISTENER DE COORDENADAS ==========
    _configurarListenerCoordenadas() {
        const latInput = document.getElementById('latitudSucursal');
        const lngInput = document.getElementById('longitudSucursal');

        if (latInput && lngInput) {
            // Listener para cuando cambian las coordenadas manualmente
            const handleCoordenadasChange = () => {
                // Limpiar timeout anterior
                if (this.coordenadasTimeout) {
                    clearTimeout(this.coordenadasTimeout);
                }

                const lat = parseFloat(latInput.value);
                const lng = parseFloat(lngInput.value);

                // Validar que sean números válidos y estén dentro de México
                if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                    // Validar límites de México
                    if (lat >= 14.5 && lat <= 33.5 && lng >= -118.5 && lng <= -86.5) {
                        // Esperar 500ms después de que el usuario deje de escribir
                        this.coordenadasTimeout = setTimeout(() => {
                            this._obtenerDireccionDesdeCoordenadas(lat, lng);
                        }, 500);
                    } else {
                        this._mostrarNotificacion('❌ Las coordenadas deben estar dentro de México', 'warning', 2000);
                    }
                }
            };

            latInput.addEventListener('input', handleCoordenadasChange);
            lngInput.addEventListener('input', handleCoordenadasChange);
        }
    }

    // ========== OBTENER DIRECCIÓN DESDE COORDENADAS ==========
    async _obtenerDireccionDesdeCoordenadas(lat, lng) {
        try {
            this._mostrarNotificacion('Obteniendo dirección exacta...', 'info', 1000);

            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const data = await response.json();

            if (data && data.display_name) {
                const direccionInput = document.getElementById('direccionSucursal');
                const ciudadInput = document.getElementById('ciudadSucursal');
                const estadoSelect = document.getElementById('estadoSucursal');

                // Actualizar dirección
                if (direccionInput) {
                    direccionInput.value = data.display_name;
                }

                // Actualizar ciudad si está disponible
                if (ciudadInput && data.address) {
                    const ciudad = data.address.city || data.address.town || data.address.village || data.address.municipality;
                    if (ciudad) {
                        ciudadInput.value = ciudad;
                    }
                }

                // Actualizar estado si está disponible y coincide con nuestra lista
                if (estadoSelect && data.address && data.address.state) {
                    const estadoEncontrado = data.address.state;
                    // Buscar si el estado existe en nuestro select
                    for (let i = 0; i < estadoSelect.options.length; i++) {
                        if (estadoSelect.options[i].text === estadoEncontrado) {
                            estadoSelect.selectedIndex = i;
                            break;
                        }
                    }
                }

                this._mostrarNotificacion('Dirección obtenida correctamente', 'success', 2000);
            }
        } catch (error) {
            console.error('Error obteniendo dirección:', error);
            this._mostrarNotificacion('No se pudo obtener la dirección', 'error', 2000);
        }
    }

    // ========== CONFIGURACIÓN DE EVENTOS ==========
    _configurarEventos() {
        try {
            // Botón Volver a la lista
            const btnVolverLista = document.getElementById('btnVolverLista');
            if (btnVolverLista) {
                btnVolverLista.addEventListener('click', () => this._volverALista());
            }

            // Botón Cancelar
            const btnCancelar = document.getElementById('btnCancelar');
            if (btnCancelar) {
                btnCancelar.addEventListener('click', () => this._cancelarEdicion());
            }

            // Botón Actualizar
            const btnActualizar = document.getElementById('btnActualizarSucursal');
            if (btnActualizar) {
                btnActualizar.addEventListener('click', (e) => {
                    e.preventDefault();
                    this._validarYActualizar();
                });
            }

            // Formulario Submit
            const form = document.getElementById('formEditarSucursal');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this._validarYActualizar();
                });
            }

        } catch (error) {
            console.error('Error configurando eventos:', error);
        }
    }

    // ========== VALIDACIÓN Y ACTUALIZACIÓN ==========
    _validarYActualizar() {
        // Obtener elementos
        const elements = {
            nombreSucursal: document.getElementById('nombreSucursal'),
            tipoSucursal: document.getElementById('tipoSucursal'),
            regionSucursal: document.getElementById('regionSucursal'),
            estadoSucursal: document.getElementById('estadoSucursal'),
            ciudadSucursal: document.getElementById('ciudadSucursal'),
            direccionSucursal: document.getElementById('direccionSucursal'),
            latitudSucursal: document.getElementById('latitudSucursal'),
            longitudSucursal: document.getElementById('longitudSucursal'),
            contactoSucursal: document.getElementById('contactoSucursal'),
            zonaSucursal: document.getElementById('zonaSucursal')
        };

        // Validar campos requeridos
        const errores = [];

        if (!elements.nombreSucursal.value.trim()) {
            elements.nombreSucursal.classList.add('is-invalid');
            errores.push('El nombre de la sucursal es obligatorio');
        } else {
            elements.nombreSucursal.classList.remove('is-invalid');
        }

        if (!elements.tipoSucursal.value.trim()) {
            elements.tipoSucursal.classList.add('is-invalid');
            errores.push('El tipo de sucursal es obligatorio');
        } else {
            elements.tipoSucursal.classList.remove('is-invalid');
        }

        if (!elements.regionSucursal.value) {
            elements.regionSucursal.classList.add('is-invalid');
            errores.push('Debe seleccionar una región');
        } else {
            elements.regionSucursal.classList.remove('is-invalid');
        }

        if (!elements.estadoSucursal.value) {
            elements.estadoSucursal.classList.add('is-invalid');
            errores.push('Debe seleccionar un estado');
        } else {
            elements.estadoSucursal.classList.remove('is-invalid');
        }

        if (!elements.ciudadSucursal.value.trim()) {
            elements.ciudadSucursal.classList.add('is-invalid');
            errores.push('La ciudad es obligatoria');
        } else {
            elements.ciudadSucursal.classList.remove('is-invalid');
        }

        if (!elements.direccionSucursal.value.trim()) {
            elements.direccionSucursal.classList.add('is-invalid');
            errores.push('La dirección es obligatoria');
        } else {
            elements.direccionSucursal.classList.remove('is-invalid');
        }

        if (!elements.latitudSucursal.value.trim()) {
            elements.latitudSucursal.classList.add('is-invalid');
            errores.push('La latitud es obligatoria');
        } else {
            elements.latitudSucursal.classList.remove('is-invalid');
        }

        if (!elements.longitudSucursal.value.trim()) {
            elements.longitudSucursal.classList.add('is-invalid');
            errores.push('La longitud es obligatoria');
        } else {
            elements.longitudSucursal.classList.remove('is-invalid');
        }

        // Validar teléfono
        if (!elements.contactoSucursal.value.trim()) {
            elements.contactoSucursal.classList.add('is-invalid');
            errores.push('El teléfono de contacto es obligatorio');
        } else {
            const telefono = elements.contactoSucursal.value.replace(/\D/g, '');
            if (telefono.length < 10) {
                elements.contactoSucursal.classList.add('is-invalid');
                errores.push('El teléfono debe tener 10 dígitos');
            } else {
                elements.contactoSucursal.classList.remove('is-invalid');
            }
        }

        // Validar que las coordenadas estén dentro de México
        const lat = parseFloat(elements.latitudSucursal.value);
        const lng = parseFloat(elements.longitudSucursal.value);
        if (!isNaN(lat) && !isNaN(lng)) {
            if (lat < 14.5 || lat > 33.5 || lng < -118.5 || lng > -86.5) {
                errores.push('❌ Las coordenadas deben estar dentro del territorio mexicano');
                elements.latitudSucursal.classList.add('is-invalid');
                elements.longitudSucursal.classList.add('is-invalid');
            }
        }

        if (errores.length > 0) {
            this._mostrarErrorValidacion(errores);
            return;
        }

        // Detectar cambios
        const cambios = this._detectarCambios();

        if (cambios.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Sin cambios',
                text: 'No se detectaron cambios en los datos de la sucursal',
                timer: 2000,
                showConfirmButton: false,
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)'
            });
            return;
        }

        // Confirmar actualización
        this._confirmarActualizacion(cambios);
    }

    // ✅ NUEVO: Detectar cambios en la sucursal
    _detectarCambios() {
        const cambios = [];

        // Obtener valores actuales
        const valoresActuales = {
            nombre: document.getElementById('nombreSucursal').value.trim(),
            tipo: document.getElementById('tipoSucursal').value.trim(),
            regionId: document.getElementById('regionSucursal').value,
            estado: document.getElementById('estadoSucursal').value,
            ciudad: document.getElementById('ciudadSucursal').value.trim(),
            direccion: document.getElementById('direccionSucursal').value.trim(),
            zona: document.getElementById('zonaSucursal').value.trim(),
            contacto: document.getElementById('contactoSucursal').value.trim(),
            latitud: document.getElementById('latitudSucursal').value.trim(),
            longitud: document.getElementById('longitudSucursal').value.trim()
        };

        // Comparar con original
        if (valoresActuales.nombre !== (this.sucursalOriginal.nombre || '')) {
            cambios.push({
                campo: 'nombre',
                anterior: this.sucursalOriginal.nombre || '',
                nuevo: valoresActuales.nombre
            });
        }

        if (valoresActuales.tipo !== (this.sucursalOriginal.tipo || '')) {
            cambios.push({
                campo: 'tipo',
                anterior: this.sucursalOriginal.tipo || '',
                nuevo: valoresActuales.tipo
            });
        }

        if (valoresActuales.regionId !== (this.sucursalOriginal.regionId || '')) {
            cambios.push({
                campo: 'región',
                anterior: 'Región anterior',
                nuevo: valoresActuales.regionId
            });
        }

        if (valoresActuales.estado !== (this.sucursalOriginal.estado || '')) {
            cambios.push({
                campo: 'estado',
                anterior: this.sucursalOriginal.estado || '',
                nuevo: valoresActuales.estado
            });
        }

        if (valoresActuales.ciudad !== (this.sucursalOriginal.ciudad || '')) {
            cambios.push({
                campo: 'ciudad',
                anterior: this.sucursalOriginal.ciudad || '',
                nuevo: valoresActuales.ciudad
            });
        }

        if (valoresActuales.direccion !== (this.sucursalOriginal.direccion || '')) {
            cambios.push({
                campo: 'dirección',
                anterior: this.sucursalOriginal.direccion?.substring(0, 50) || '',
                nuevo: valoresActuales.direccion?.substring(0, 50) || ''
            });
        }

        if (valoresActuales.zona !== (this.sucursalOriginal.zona || '')) {
            cambios.push({
                campo: 'zona',
                anterior: this.sucursalOriginal.zona || '',
                nuevo: valoresActuales.zona
            });
        }

        if (valoresActuales.contacto !== (this.sucursalOriginal.contacto || '')) {
            cambios.push({
                campo: 'contacto',
                anterior: this.sucursalOriginal.contacto || '',
                nuevo: valoresActuales.contacto
            });
        }

        const latOriginal = this.sucursalOriginal.latitud?.toString() || '';
        const lngOriginal = this.sucursalOriginal.longitud?.toString() || '';

        if (valoresActuales.latitud !== latOriginal || valoresActuales.longitud !== lngOriginal) {
            cambios.push({
                campo: 'coordenadas',
                anterior: `${latOriginal}, ${lngOriginal}`,
                nuevo: `${valoresActuales.latitud}, ${valoresActuales.longitud}`
            });
        }

        return cambios;
    }

    _mostrarErrorValidacion(errores) {
        Swal.fire({
            icon: 'error',
            title: 'Error de validación',
            html: errores.map(msg => `• ${msg}`).join('<br>'),
            confirmButtonText: 'Corregir',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        });
    }

    _confirmarActualizacion(cambios) {
        const regionSelect = document.getElementById('regionSucursal');
        const regionOption = regionSelect.options[regionSelect.selectedIndex];
        const regionNombre = regionOption.getAttribute('data-region-nombre') || regionOption.textContent;

        const nombre = document.getElementById('nombreSucursal').value.trim();
        const tipo = document.getElementById('tipoSucursal').value.trim();
        const estado = document.getElementById('estadoSucursal').value;
        const ciudad = document.getElementById('ciudadSucursal').value.trim();
        const direccion = document.getElementById('direccionSucursal').value.trim();
        const latitud = document.getElementById('latitudSucursal').value.trim();
        const longitud = document.getElementById('longitudSucursal').value.trim();

        // Generar HTML de cambios
        let cambiosHTML = '';
        cambios.forEach(cambio => {
            cambiosHTML += `
                <div style="margin-bottom: 8px; padding: 6px; background: rgba(0,0,0,0.2); border-radius: 4px;">
                    <strong style="color: var(--color-accent-primary);">${cambio.campo}:</strong><br>
                    <span style="color: var(--color-text-dim);">Anterior: ${cambio.anterior || '(vacío)'}</span><br>
                    <span style="color: var(--color-accent-secondary);">Nuevo: ${cambio.nuevo || '(vacío)'}</span>
                </div>
            `;
        });

        // Mostrar confirmación con SweetAlert2
        Swal.fire({
            title: '¿Confirmar actualización?',
            html: `
                <div style="text-align: left;">
                    <p><strong>Nombre:</strong> ${nombre}</p>
                    <p><strong>Tipo:</strong> ${tipo}</p>
                    <p><strong>Región:</strong> ${regionNombre}</p>
                    <p><strong>Estado:</strong> ${estado}</p>
                    <p><strong>Ciudad:</strong> ${ciudad}</p>
                    <p><strong>Dirección:</strong> ${direccion}</p>
                    <p><strong>Coordenadas:</strong> ${latitud}, ${longitud}</p>
                    <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <strong>Cambios detectados:</strong>
                        ${cambiosHTML}
                    </div>
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, actualizar',
            cancelButtonText: 'Cancelar',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        }).then((result) => {
            if (result.isConfirmed) {
                this._actualizarSucursal(cambios);
            }
        });
    }

    async _actualizarSucursal(cambios) {
        const btnActualizar = document.getElementById('btnActualizarSucursal');
        const originalHTML = btnActualizar ? btnActualizar.innerHTML : '<i class="fas fa-save"></i>Actualizar Sucursal';

        try {
            if (btnActualizar) {
                btnActualizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
                btnActualizar.disabled = true;
            }

            this._mostrarCargando('Actualizando sucursal...');

            // Obtener datos del formulario (campos directos)
            const sucursalData = {
                nombre: document.getElementById('nombreSucursal').value.trim(),
                tipo: document.getElementById('tipoSucursal').value.trim(),
                regionId: document.getElementById('regionSucursal').value,
                estado: document.getElementById('estadoSucursal').value,
                ciudad: document.getElementById('ciudadSucursal').value.trim(),
                direccion: document.getElementById('direccionSucursal').value.trim(),
                zona: document.getElementById('zonaSucursal').value.trim() || '',
                contacto: document.getElementById('contactoSucursal').value.trim(),
                latitud: parseFloat(document.getElementById('latitudSucursal').value),
                longitud: parseFloat(document.getElementById('longitudSucursal').value)
            };

            // Validar que las coordenadas sean números válidos y estén dentro de México
            if (isNaN(sucursalData.latitud) || isNaN(sucursalData.longitud)) {
                throw new Error('Las coordenadas deben ser números válidos');
            }

            if (sucursalData.latitud < 14.5 || sucursalData.latitud > 33.5 ||
                sucursalData.longitud < -118.5 || sucursalData.longitud > -86.5) {
                throw new Error('❌ Las coordenadas deben estar dentro del territorio mexicano');
            }

            // Actualizar sucursal
            const sucursalActualizada = await this.sucursalManager.actualizarSucursal(
                this.sucursalId,
                sucursalData,
                this.usuarioActual.id,
                this.usuarioActual.organizacionCamelCase
            );

            // ✅ NUEVO: Registrar edición en bitácora
            await this._registrarEdicionSucursal(this.sucursalOriginal, sucursalActualizada, cambios);

            this._ocultarCargando();

            // Mostrar éxito
            await this._mostrarExitoActualizacion(sucursalActualizada);

        } catch (error) {
            this._ocultarCargando();
            console.error('Error actualizando sucursal:', error);
            this._mostrarError(error.message || 'No se pudo actualizar la sucursal');
        } finally {
            if (btnActualizar) {
                btnActualizar.innerHTML = originalHTML;
                btnActualizar.disabled = false;
            }
        }
    }

    async _mostrarExitoActualizacion(sucursal) {
        await Swal.fire({
            icon: 'success',
            title: '¡Sucursal actualizada!',
            text: 'Los cambios se han guardado correctamente',
            confirmButtonText: 'Ir a Sucursales',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        }).then(() => {
            this._volverALista();
        });
    }

    // ========== FUNCIONES DEL MAPA LIMITADO A MÉXICO ==========
    _inicializarMapa() {
        try {
            // =============================================
            // LÍMITES ESTRICTOS DE MÉXICO
            // =============================================
            // Esquina Suroeste (Chiapas, Baja California Sur)
            // Esquina Noreste (Tamaulipas, Quintana Roo)
            const southWest = L.latLng(14.5, -118.5);
            const northEast = L.latLng(33.5, -86.5);
            const mexicoBounds = L.latLngBounds(southWest, northEast);

            // Centro exacto de México
            const centroMexico = { lat: 23.6345, lng: -102.5528 };

            // Obtener coordenadas de la sucursal
            let lat = parseFloat(document.getElementById('latitudSucursal').value);
            let lng = parseFloat(document.getElementById('longitudSucursal').value);

            // Validar que las coordenadas estén dentro de México
            if (isNaN(lat) || isNaN(lng) || lat < 14.5 || lat > 33.5 || lng < -118.5 || lng > -86.5) {
                lat = centroMexico.lat;
                lng = centroMexico.lng;
            }

            // =============================================
            // CREAR MAPA CON RESTRICCIONES
            // =============================================
            this.map = L.map('sucursalMap', {
                center: [lat, lng],
                zoom: 6,
                minZoom: 5,                    // Zoom mínimo (no deja alejarse más)
                maxZoom: 18,                   // Zoom máximo
                maxBounds: mexicoBounds,       // NO permite salirse de México
                maxBoundsViscosity: 1.0,       // Hace que el mapa "rebote" en los bordes
                zoomControl: true
            });

            // Establecer los límites de forma estricta (evita que el usuario se salga)
            this.map.setMaxBounds(mexicoBounds);

            // También evitar que el usuario arrastre el mapa fuera de los límites
            this.map.on('drag', () => {
                const bounds = this.map.getBounds();
                if (!mexicoBounds.contains(bounds.getNorthWest()) || !mexicoBounds.contains(bounds.getSouthEast())) {
                    this.map.setView(centroMexico, 5);
                }
            });

            // Capa de OpenStreetMap
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors | Centinela-MX | 🇲🇽 Solo México',
                maxZoom: 19
            }).addTo(this.map);

            // Icono personalizado para el marcador
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: '<i class="fas fa-map-marker-alt"></i>',
                iconSize: [30, 30],
                popupAnchor: [0, -15]
            });

            // Crear marcador (arrastrable pero con límites)
            this.marker = L.marker([lat, lng], {
                draggable: true,
                icon: customIcon
            }).addTo(this.map);

            // Popup del marcador
            this.marker.bindPopup(`
                <b>${document.getElementById('nombreSucursal').value || 'Sucursal'}</b><br>
                🇲🇽 Solo ubicaciones dentro de México
            `).openPopup();

            // Evento cuando se arrastra el marcador (con validación estricta)
            this.marker.on('drag', (event) => {
                const position = event.target.getLatLng();
                if (position.lat < 14.5 || position.lat > 33.5 || position.lng < -118.5 || position.lng > -86.5) {
                    this.marker.setLatLng([lat, lng]);
                    this._mostrarNotificacion('❌ No puedes poner la sucursal fuera de México', 'warning', 2000);
                }
            });

            this.marker.on('dragend', (event) => {
                const position = event.target.getLatLng();
                if (position.lat >= 14.5 && position.lat <= 33.5 && position.lng >= -118.5 && position.lng <= -86.5) {
                    this._actualizarCoordenadasMapa(position.lat, position.lng);
                    this._obtenerDireccionDesdeCoordenadas(position.lat, position.lng);
                    lat = position.lat;
                    lng = position.lng;
                } else {
                    this.marker.setLatLng([lat, lng]);
                    this._mostrarNotificacion('❌ La ubicación debe estar dentro del territorio mexicano', 'warning', 3000);
                }
            });

            // Evento cuando se hace clic en el mapa (con validación)
            this.map.on('click', (e) => {
                const latClick = e.latlng.lat;
                const lngClick = e.latlng.lng;

                if (latClick >= 14.5 && latClick <= 33.5 && lngClick >= -118.5 && lngClick <= -86.5) {
                    this._colocarMarcador(e.latlng);
                    this._obtenerDireccionDesdeCoordenadas(latClick, lngClick);
                    lat = latClick;
                    lng = lngClick;
                } else {
                    this._mostrarNotificacion('❌ Solo puedes seleccionar ubicaciones dentro de México', 'warning', 2000);
                }
            });

            // Sincronizar con campos de texto
            this._actualizarCoordenadasMapa(lat, lng);

            this.mapInitialized = true;

            // Configurar eventos del mapa
            this._configurarEventosMapa();

            console.log('🗺️ Mapa inicializado - Limitado a México');

        } catch (error) {
            console.error('Error inicializando mapa:', error);
            this._mostrarNotificacion('Error al cargar el mapa', 'error');
        }
    }

    _configurarEventosMapa() {
        // Botón centrar mapa
        const btnCentrar = document.getElementById('btnCentrarMapa');
        if (btnCentrar) {
            btnCentrar.addEventListener('click', () => {
                const lat = parseFloat(document.getElementById('latitudSucursal').value);
                const lng = parseFloat(document.getElementById('longitudSucursal').value);

                if (!isNaN(lat) && !isNaN(lng) && lat >= 14.5 && lat <= 33.5 && lng >= -118.5 && lng <= -86.5) {
                    this.map.setView([lat, lng], 15);
                } else {
                    this.map.setView([23.6345, -102.5528], 6);
                }
            });
        }

        // Botón buscar dirección
        const btnBuscar = document.getElementById('btnBuscarDireccion');
        if (btnBuscar) {
            btnBuscar.addEventListener('click', () => this._buscarDireccionEnMapa());
        }

        // Botón obtener ubicación actual
        const btnUbicacion = document.getElementById('btnObtenerUbicacion');
        if (btnUbicacion) {
            btnUbicacion.addEventListener('click', () => this._obtenerUbicacionActual());
        }

        // Sincronizar cambios en los inputs de coordenadas
        const latInput = document.getElementById('latitudSucursal');
        const lngInput = document.getElementById('longitudSucursal');

        if (latInput && lngInput) {
            latInput.addEventListener('change', () => {
                const lat = parseFloat(latInput.value);
                const lng = parseFloat(lngInput.value);
                if (!isNaN(lat) && !isNaN(lng) && lat >= 14.5 && lat <= 33.5 && lng >= -118.5 && lng <= -86.5) {
                    this.actualizandoDesdeMapa = true;
                    this._colocarMarcador([lat, lng]);
                    this.actualizandoDesdeMapa = false;
                }
            });

            lngInput.addEventListener('change', () => {
                const lat = parseFloat(latInput.value);
                const lng = parseFloat(lngInput.value);
                if (!isNaN(lat) && !isNaN(lng) && lat >= 14.5 && lat <= 33.5 && lng >= -118.5 && lng <= -86.5) {
                    this.actualizandoDesdeMapa = true;
                    this._colocarMarcador([lat, lng]);
                    this.actualizandoDesdeMapa = false;
                }
            });
        }

        // Evento para cuando se selecciona un estado
        const estadoSelect = document.getElementById('estadoSucursal');
        if (estadoSelect) {
            estadoSelect.addEventListener('change', (e) => {
                const estadoSeleccionado = e.target.value;
                if (estadoSeleccionado) {
                    this._centrarMapaEnEstado(estadoSeleccionado);
                }
            });
        }
    }

    _colocarMarcador(posicion) {
        if (!this.map || !this.marker) return;

        this.marker.setLatLng(posicion);
        this.map.setView(posicion, 15);
        this._actualizarCoordenadasMapa(posicion.lat, posicion.lng);
    }

    _actualizarCoordenadasMapa(lat, lng) {
        // Redondear a 6 decimales
        const latFormatted = Number(lat).toFixed(6);
        const lngFormatted = Number(lng).toFixed(6);

        // Actualizar campos del formulario (SOLO si no estamos actualizando desde el mapa)
        if (!this.actualizandoDesdeMapa) {
            const latInput = document.getElementById('latitudSucursal');
            const lngInput = document.getElementById('longitudSucursal');

            if (latInput) latInput.value = latFormatted;
            if (lngInput) lngInput.value = lngFormatted;
        }

        // Actualizar display en el mapa
        const mapLat = document.getElementById('mapLatitud');
        const mapLng = document.getElementById('mapLongitud');

        if (mapLat) mapLat.textContent = latFormatted;
        if (mapLng) mapLng.textContent = lngFormatted;

        // Actualizar popup del marcador
        if (this.marker) {
            const nombre = document.getElementById('nombreSucursal').value || 'Sucursal';
            this.marker.setPopupContent(`
                <b>${nombre}</b><br>
                Lat: ${latFormatted}, Lng: ${lngFormatted}
            `);
        }
    }

    async _buscarDireccionEnMapa() {
        const direccion = document.getElementById('direccionSucursal').value;

        if (!direccion) {
            this._mostrarNotificacion('Por favor ingresa una dirección para buscar', 'warning');
            return;
        }

        try {
            this._mostrarCargando('Buscando dirección exacta...');

            // Buscar SOLO en México con countrycodes=mx
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}&limit=1&countrycodes=mx&addressdetails=1`);
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                // Validar que la dirección esté dentro de México
                if (lat >= 14.5 && lat <= 33.5 && lon >= -118.5 && lon <= -86.5) {
                    this._colocarMarcador([lat, lon]);
                    await this._obtenerDireccionDesdeCoordenadas(lat, lon);
                    this._mostrarNotificacion('✅ Dirección encontrada en México', 'success', 2000);
                } else {
                    this._mostrarNotificacion('❌ La dirección buscada está fuera de México', 'warning');
                }
            } else {
                this._mostrarNotificacion('❌ No se encontró la dirección en México. Intenta con más detalles (ciudad, estado)', 'warning');
            }
        } catch (error) {
            console.error('Error buscando dirección:', error);
            this._mostrarNotificacion('Error al buscar la dirección', 'error');
        } finally {
            this._ocultarCargando();
        }
    }

    _obtenerUbicacionActual() {
        if (!navigator.geolocation) {
            this._mostrarNotificacion('Tu navegador no soporta geolocalización', 'error');
            return;
        }

        this._mostrarCargando('Obteniendo tu ubicación exacta...');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                // Validar que la ubicación esté dentro de México
                if (latitude >= 14.5 && latitude <= 33.5 && longitude >= -118.5 && longitude <= -86.5) {
                    this._colocarMarcador([latitude, longitude]);
                    this._obtenerDireccionDesdeCoordenadas(latitude, longitude);
                    this._mostrarNotificacion('✅ Ubicación obtenida dentro de México', 'success', 2000);
                } else {
                    this._mostrarNotificacion('❌ Tu ubicación actual está fuera de México. Solo se permiten sucursales en territorio mexicano.', 'warning');
                    this.map.setView([23.6345, -102.5528], 5);
                }
                this._ocultarCargando();
            },
            (error) => {
                this._ocultarCargando();
                let mensaje = 'Error obteniendo ubicación';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        mensaje = 'Permiso denegado para obtener ubicación';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensaje = 'Información de ubicación no disponible';
                        break;
                    case error.TIMEOUT:
                        mensaje = 'Tiempo de espera agotado';
                        break;
                }
                this._mostrarNotificacion(mensaje, 'error');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }

    // ========== FUNCIÓN PARA CENTRAR MAPA EN ESTADO SELECCIONADO ==========
    _centrarMapaEnEstado(estado) {
        if (!this.map) return;

        // Coordenadas aproximadas de los estados de México
        const coordenadasEstados = {
            "Aguascalientes": [21.8853, -102.2916],
            "Baja California": [32.5000, -115.5000],
            "Baja California Sur": [25.0000, -111.5000],
            "Campeche": [19.0000, -90.5000],
            "Chiapas": [16.5000, -92.5000],
            "Chihuahua": [28.5000, -106.0000],
            "Coahuila": [27.5000, -101.5000],
            "Colima": [19.5000, -103.5000],
            "Durango": [24.5000, -104.5000],
            "Guanajuato": [21.0000, -101.5000],
            "Guerrero": [17.5000, -100.0000],
            "Hidalgo": [20.5000, -98.5000],
            "Jalisco": [20.5000, -103.5000],
            "México": [19.5000, -99.5000],
            "Estado de México": [19.5000, -99.5000],
            "Ciudad de México": [19.4326, -99.1332],
            "Michoacán": [19.5000, -101.5000],
            "Morelos": [18.5000, -99.0000],
            "Nayarit": [22.0000, -105.0000],
            "Nuevo León": [25.5000, -100.0000],
            "Oaxaca": [17.5000, -96.5000],
            "Puebla": [19.0000, -98.0000],
            "Querétaro": [20.5000, -100.0000],
            "Quintana Roo": [20.5000, -87.5000],
            "San Luis Potosí": [22.5000, -100.5000],
            "Sinaloa": [25.0000, -107.5000],
            "Sonora": [29.5000, -110.0000],
            "Tabasco": [18.0000, -92.5000],
            "Tamaulipas": [24.5000, -98.5000],
            "Tlaxcala": [19.5000, -98.5000],
            "Veracruz": [19.5000, -96.5000],
            "Yucatán": [20.5000, -89.0000],
            "Zacatecas": [23.5000, -102.5000]
        };

        const coords = coordenadasEstados[estado];

        if (coords) {
            this.map.setView(coords, 8);
            L.popup()
                .setLatLng(coords)
                .setContent(`<b>${estado}</b><br>Haz clic en el mapa para ajustar la ubicación`)
                .openOn(this.map);

            this._mostrarNotificacion(`Mapa centrado en ${estado}`, 'info', 2000);
        } else {
            console.warn(`No se encontraron coordenadas para el estado: ${estado}`);
            this.map.setView([23.6345, -102.5528], 5);
        }
    }

    // ========== NAVEGACIÓN ==========
    _volverALista() {
        window.location.href = '../sucursales/sucursales.html';
    }

    _cancelarEdicion() {
        Swal.fire({
            title: '¿Cancelar edición?',
            text: 'Los cambios no guardados se perderán',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, cancelar',
            cancelButtonText: 'No, continuar',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        }).then((result) => {
            if (result.isConfirmed) {
                this._volverALista();
            }
        });
    }

    // ========== UTILIDADES ==========
    _mostrarError(mensaje) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: mensaje,
            confirmButtonText: 'Entendido',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        });
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
            showConfirmButton: false,
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        });
    }

    _mostrarCargando(mensaje = 'Procesando...') {
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

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    window.editarSucursalDebug.controller = new EditarSucursalController();
});