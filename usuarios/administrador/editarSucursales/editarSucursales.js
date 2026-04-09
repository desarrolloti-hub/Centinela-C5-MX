// editarSucursales.js - VERSIÓN SIN LOADING OVERLAY
window.editarSucursalDebug = {
    estado: 'iniciando',
    controller: null
};

let historialManager = null;

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
        this.sucursalOriginal = null;

        // Propiedades del mapa
        this.map = null;
        this.marker = null;
        this.mapInitialized = false;

        // Timeout para debounce
        this.coordenadasTimeout = null;

        // Bandera para evitar loops
        this.actualizandoDesdeMapa = false;

        this._init();
    }

    // ========== INICIALIZACIÓN ==========
    async _init() {
        try {
            this._cargarUsuario();

            if (!this.usuarioActual) {
                this.usuarioActual = {
                    id: `usuario_${Date.now()}`,
                    uid: `usuario_${Date.now()}`,
                    nombreCompleto: 'Usuario',
                    organizacion: 'Mi Organización',
                    organizacionCamelCase: 'miOrganizacion',
                    correo: 'usuario@ejemplo.com'
                };
            }

            await this._initHistorial();

            const urlParams = new URLSearchParams(window.location.search);
            const sucursalId = urlParams.get('id');
            const orgFromUrl = urlParams.get('org');

            if (!sucursalId) {
                throw new Error('No se especificó la sucursal a editar');
            }

            if (orgFromUrl) {
                this.usuarioActual.organizacionCamelCase = orgFromUrl;
            }

            this.sucursalId = sucursalId;

            await this._cargarManagers();
            await this._cargarRegiones();
            this._cargarEstados();
            await this._cargarDatosSucursal();
            this._aplicarLimitesCaracteres();
            this._configurarListenerCoordenadas();
            this._configurarEventos();

            setTimeout(() => this._inicializarMapa(), 1000);

            window.editarSucursalDebug.controller = this;

        } catch (error) {
            console.error('Error inicializando:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    async _initHistorial() {
        try {
            const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
            historialManager = new HistorialUsuarioManager();
        } catch (error) {
            // Error silencioso
        }
    }

    async _registrarEdicionSucursal(sucursalOriginal, sucursalActualizada, cambios) {
        if (!historialManager) return;

        try {
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
        } catch (error) {
            // Error silencioso
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

            this.usuarioActual = null;

        } catch (error) {
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
        if (campo.value.length > limite) {
            campo.value = campo.value.substring(0, limite);
            this._mostrarError(`${nombreCampo} no puede exceder ${limite} caracteres`);
        }
    }

    // ========== NOTIFICACIONES ==========
    _mostrarError(mensaje) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: mensaje,
            confirmButtonText: 'OK',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            confirmButtonColor: '#dc3545'
        });
    }

    _mostrarExito(mensaje) {
        Swal.fire({
            icon: 'success',
            title: '¡Completado!',
            text: mensaje,
            confirmButtonText: 'OK',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            confirmButtonColor: '#28a745'
        });
    }

    _mostrarInfo(mensaje) {
        Swal.fire({
            icon: 'info',
            title: 'Información',
            text: mensaje,
            confirmButtonText: 'OK',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            confirmButtonColor: '#17a2b8'
        });
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
            const sucursal = await this.sucursalManager.getSucursalById(
                this.sucursalId,
                this.usuarioActual.organizacionCamelCase
            );

            if (!sucursal) {
                throw new Error('No se encontró la sucursal especificada');
            }

            this.sucursalActual = sucursal;
            this.sucursalOriginal = JSON.parse(JSON.stringify(sucursal));

            this._llenarFormulario(sucursal);

        } catch (error) {
            throw error;
        }
    }

    _llenarFormulario(sucursal) {
        this._setValue('sucursalId', sucursal.id);
        this._setValue('organizacionCamelCase', sucursal.organizacionCamelCase);
        this._setValue('nombreSucursal', sucursal.nombre || '');
        this._setValue('tipoSucursal', sucursal.tipo || '');
        this._setValue('zonaSucursal', sucursal.zona || '');
        this._setValue('ciudadSucursal', sucursal.ciudad || '');
        this._setValue('direccionSucursal', sucursal.direccion || '');
        this._setValue('contactoSucursal', sucursal.contacto || '');
        this._setValue('latitudSucursal', sucursal.latitud || '');
        this._setValue('longitudSucursal', sucursal.longitud || '');

        if (sucursal.regionId) {
            setTimeout(() => {
                const regionSelect = document.getElementById('regionSucursal');
                if (regionSelect) {
                    regionSelect.value = sucursal.regionId;
                }
            }, 500);
        }

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
            const handleCoordenadasChange = () => {
                if (this.coordenadasTimeout) {
                    clearTimeout(this.coordenadasTimeout);
                }

                const lat = parseFloat(latInput.value);
                const lng = parseFloat(lngInput.value);

                if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                    if (lat >= 14.5 && lat <= 33.5 && lng >= -118.5 && lng <= -86.5) {
                        this.coordenadasTimeout = setTimeout(() => {
                            this._obtenerDireccionDesdeCoordenadas(lat, lng);
                        }, 500);
                    } else {
                        this._mostrarError('Las coordenadas deben estar dentro de México');
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            if (data && data.display_name) {
                const direccionInput = document.getElementById('direccionSucursal');
                const ciudadInput = document.getElementById('ciudadSucursal');
                const estadoSelect = document.getElementById('estadoSucursal');

                if (direccionInput) {
                    direccionInput.value = data.display_name;
                }

                if (ciudadInput && data.address) {
                    const ciudad = data.address.city || data.address.town || data.address.village || data.address.municipality;
                    if (ciudad) {
                        ciudadInput.value = ciudad;
                    }
                }

                if (estadoSelect && data.address && data.address.state) {
                    const estadoEncontrado = data.address.state;
                    for (let i = 0; i < estadoSelect.options.length; i++) {
                        if (estadoSelect.options[i].text === estadoEncontrado) {
                            estadoSelect.selectedIndex = i;
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            // Error silencioso
        }
    }

    // ========== CONFIGURACIÓN DE EVENTOS ==========
    _configurarEventos() {
        try {
            const btnVolverLista = document.getElementById('btnVolverLista');
            if (btnVolverLista) {
                btnVolverLista.addEventListener('click', () => this._volverALista());
            }

            const btnCancelar = document.getElementById('btnCancelar');
            if (btnCancelar) {
                btnCancelar.addEventListener('click', () => this._cancelarEdicion());
            }

            const btnActualizar = document.getElementById('btnActualizarSucursal');
            if (btnActualizar) {
                btnActualizar.addEventListener('click', (e) => {
                    e.preventDefault();
                    this._validarYActualizar();
                });
            }

            const form = document.getElementById('formEditarSucursal');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this._validarYActualizar();
                });
            }

        } catch (error) {
            // Error silencioso
        }
    }

    // ========== VALIDACIÓN Y ACTUALIZACIÓN ==========
    _validarYActualizar() {
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

        const lat = parseFloat(elements.latitudSucursal.value);
        const lng = parseFloat(elements.longitudSucursal.value);
        if (!isNaN(lat) && !isNaN(lng)) {
            if (lat < 14.5 || lat > 33.5 || lng < -118.5 || lng > -86.5) {
                errores.push('Las coordenadas deben estar dentro del territorio mexicano');
                elements.latitudSucursal.classList.add('is-invalid');
                elements.longitudSucursal.classList.add('is-invalid');
            }
        }

        if (errores.length > 0) {
            this._mostrarErrorValidacion(errores);
            return;
        }

        const cambios = this._detectarCambios();

        if (cambios.length === 0) {
            this._mostrarInfo('No se detectaron cambios en los datos de la sucursal');
            return;
        }

        this._confirmarActualizacion(cambios);
    }

    _detectarCambios() {
        const cambios = [];

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

        Swal.fire({
            title: '¿Confirmar actualización?',
            html: `
                <div style="text-align: left;">
                    <p><strong>Nombre:</strong> ${this._escapeHTML(nombre)}</p>
                    <p><strong>Tipo:</strong> ${this._escapeHTML(tipo)}</p>
                    <p><strong>Región:</strong> ${this._escapeHTML(regionNombre)}</p>
                    <p><strong>Estado:</strong> ${this._escapeHTML(estado)}</p>
                    <p><strong>Ciudad:</strong> ${this._escapeHTML(ciudad)}</p>
                    <p><strong>Dirección:</strong> ${this._escapeHTML(direccion)}</p>
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

            if (isNaN(sucursalData.latitud) || isNaN(sucursalData.longitud)) {
                throw new Error('Las coordenadas deben ser números válidos');
            }

            if (sucursalData.latitud < 14.5 || sucursalData.latitud > 33.5 ||
                sucursalData.longitud < -118.5 || sucursalData.longitud > -86.5) {
                throw new Error('Las coordenadas deben estar dentro del territorio mexicano');
            }

            const sucursalActualizada = await this.sucursalManager.actualizarSucursal(
                this.sucursalId,
                sucursalData,
                this.usuarioActual.id,
                this.usuarioActual.organizacionCamelCase
            );

            await this._registrarEdicionSucursal(this.sucursalOriginal, sucursalActualizada, cambios);

            await Swal.fire({
                icon: 'success',
                title: '¡Sucursal actualizada!',
                text: 'Los cambios se han guardado correctamente',
                confirmButtonText: 'Ir a Sucursales',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                confirmButtonColor: '#28a745'
            }).then(() => {
                this._volverALista();
            });

        } catch (error) {
            this._mostrarError(error.message || 'No se pudo actualizar la sucursal');
        } finally {
            if (btnActualizar) {
                btnActualizar.innerHTML = originalHTML;
                btnActualizar.disabled = false;
            }
        }
    }

    // ========== FUNCIONES DEL MAPA ==========
    _inicializarMapa() {
        try {
            const southWest = L.latLng(14.5, -118.5);
            const northEast = L.latLng(33.5, -86.5);
            const mexicoBounds = L.latLngBounds(southWest, northEast);
            const centroMexico = { lat: 23.6345, lng: -102.5528 };

            let lat = parseFloat(document.getElementById('latitudSucursal').value);
            let lng = parseFloat(document.getElementById('longitudSucursal').value);

            if (isNaN(lat) || isNaN(lng) || lat < 14.5 || lat > 33.5 || lng < -118.5 || lng > -86.5) {
                lat = centroMexico.lat;
                lng = centroMexico.lng;
            }

            this.map = L.map('sucursalMap', {
                center: [lat, lng],
                zoom: 6,
                minZoom: 5,
                maxZoom: 18,
                maxBounds: mexicoBounds,
                maxBoundsViscosity: 1.0,
                zoomControl: false
            });

            this.map.setMaxBounds(mexicoBounds);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap | Centinela-MX | 🇲🇽 Solo México',
                maxZoom: 19
            }).addTo(this.map);

            L.control.zoom({ position: 'bottomright' }).addTo(this.map);

            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: '<i class="fas fa-map-marker-alt"></i>',
                iconSize: [30, 30],
                popupAnchor: [0, -15]
            });

            this.marker = L.marker([lat, lng], {
                draggable: true,
                icon: customIcon
            }).addTo(this.map);

            const nombre = document.getElementById('nombreSucursal').value || 'Sucursal';
            this.marker.bindPopup(`
                <b>${this._escapeHTML(nombre)}</b><br>
                🇲🇽 Solo ubicaciones dentro de México
            `).openPopup();

            this.marker.on('dragend', (event) => {
                const position = event.target.getLatLng();
                if (position.lat >= 14.5 && position.lat <= 33.5 && position.lng >= -118.5 && position.lng <= -86.5) {
                    this._actualizarCoordenadasMapa(position.lat, position.lng);
                    this._obtenerDireccionDesdeCoordenadas(position.lat, position.lng);
                    lat = position.lat;
                    lng = position.lng;
                } else {
                    this.marker.setLatLng([lat, lng]);
                    this._mostrarError('La ubicación debe estar dentro del territorio mexicano');
                }
            });

            this.map.on('click', (e) => {
                const latClick = e.latlng.lat;
                const lngClick = e.latlng.lng;

                if (latClick >= 14.5 && latClick <= 33.5 && lngClick >= -118.5 && lngClick <= -86.5) {
                    this._colocarMarcador(e.latlng);
                    this._obtenerDireccionDesdeCoordenadas(latClick, lngClick);
                    lat = latClick;
                    lng = lngClick;
                } else {
                    this._mostrarError('Solo puedes seleccionar ubicaciones dentro de México');
                }
            });

            this._actualizarCoordenadasMapa(lat, lng);
            this.mapInitialized = true;
            this._configurarEventosMapa();

        } catch (error) {
            console.error('Error inicializando mapa:', error);
        }
    }

    _configurarEventosMapa() {
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

        const btnBuscar = document.getElementById('btnBuscarDireccion');
        if (btnBuscar) {
            btnBuscar.addEventListener('click', () => this._buscarDireccionEnMapa());
        }

        const btnUbicacion = document.getElementById('btnObtenerUbicacion');
        if (btnUbicacion) {
            btnUbicacion.addEventListener('click', () => this._obtenerUbicacionActual());
        }

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

        let lat, lng;
        if (Array.isArray(posicion)) {
            lat = posicion[0];
            lng = posicion[1];
        } else if (posicion && typeof posicion === 'object') {
            lat = posicion.lat;
            lng = posicion.lng;
        } else {
            return;
        }

        this.marker.setLatLng([lat, lng]);
        this.map.setView([lat, lng], 15);
        this._actualizarCoordenadasMapa(lat, lng);
    }

    _actualizarCoordenadasMapa(lat, lng) {
        const latFormatted = Number(lat).toFixed(6);
        const lngFormatted = Number(lng).toFixed(6);

        if (!this.actualizandoDesdeMapa) {
            const latInput = document.getElementById('latitudSucursal');
            const lngInput = document.getElementById('longitudSucursal');

            if (latInput) latInput.value = latFormatted;
            if (lngInput) lngInput.value = lngFormatted;
        }

        const mapLat = document.getElementById('mapLatitud');
        const mapLng = document.getElementById('mapLongitud');

        if (mapLat) mapLat.textContent = latFormatted;
        if (mapLng) mapLng.textContent = lngFormatted;

        if (this.marker) {
            const nombre = document.getElementById('nombreSucursal').value || 'Sucursal';
            this.marker.setPopupContent(`
                <b>${this._escapeHTML(nombre)}</b><br>
                Lat: ${latFormatted}, Lng: ${lngFormatted}
            `);
        }
    }

    async _buscarDireccionEnMapa() {
        const direccion = document.getElementById('direccionSucursal').value;

        if (!direccion) {
            this._mostrarError('Ingresa una dirección para buscar');
            return;
        }

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}&limit=1&countrycodes=mx&addressdetails=1`);
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                if (lat >= 14.5 && lat <= 33.5 && lon >= -118.5 && lon <= -86.5) {
                    this._colocarMarcador([lat, lon]);
                    await this._obtenerDireccionDesdeCoordenadas(lat, lon);
                    this._mostrarExito('Dirección encontrada en México');
                } else {
                    this._mostrarError('La dirección buscada está fuera de México');
                }
            } else {
                this._mostrarError('No se encontró la dirección en México');
            }
        } catch (error) {
            this._mostrarError('Error al buscar la dirección');
        }
    }

    _obtenerUbicacionActual() {
        if (!navigator.geolocation) {
            this._mostrarError('Tu navegador no soporta geolocalización');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                if (latitude >= 14.5 && latitude <= 33.5 && longitude >= -118.5 && longitude <= -86.5) {
                    this._colocarMarcador([latitude, longitude]);
                    this._obtenerDireccionDesdeCoordenadas(latitude, longitude);
                    this._mostrarExito('Ubicación obtenida dentro de México');
                } else {
                    this._mostrarError('Tu ubicación está fuera de México');
                    this.map.setView([23.6345, -102.5528], 5);
                }
            },
            (error) => {
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
                this._mostrarError(mensaje);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }

    _centrarMapaEnEstado(estado) {
        if (!this.map) return;

        const coordenadasEstados = {
            "Aguascalientes": [21.8853, -102.2916],
            "Baja California": [30.8406, -115.2838],
            "Baja California Sur": [25.8378, -111.9748],
            "Campeche": [19.8301, -90.5349],
            "Chiapas": [16.7569, -93.1292],
            "Chihuahua": [28.6329, -106.0691],
            "Coahuila": [27.0587, -101.7068],
            "Colima": [19.2452, -103.7241],
            "Durango": [24.0277, -104.6532],
            "Guanajuato": [21.0190, -101.2574],
            "Guerrero": [17.4392, -99.5451],
            "Hidalgo": [20.0911, -98.7624],
            "Jalisco": [20.6595, -103.3496],
            "México": [19.2870, -99.6544],
            "Estado de México": [19.2870, -99.6544],
            "Ciudad de México": [19.4326, -99.1332],
            "Michoacán": [19.5665, -101.7068],
            "Morelos": [18.6813, -99.1013],
            "Nayarit": [21.7514, -104.8455],
            "Nuevo León": [25.5921, -99.9962],
            "Oaxaca": [17.0732, -96.7266],
            "Puebla": [19.0414, -98.2062],
            "Querétaro": [20.5888, -100.3899],
            "Quintana Roo": [19.1814, -88.4794],
            "San Luis Potosí": [22.1565, -100.9855],
            "Sinaloa": [24.8091, -107.3940],
            "Sonora": [29.2970, -110.3309],
            "Tabasco": [17.9892, -92.9475],
            "Tamaulipas": [24.2669, -98.8362],
            "Tlaxcala": [19.3181, -98.2375],
            "Veracruz": [19.1738, -96.1342],
            "Yucatán": [20.7099, -89.0943],
            "Zacatecas": [23.1273, -102.8722]
        };

        const coords = coordenadasEstados[estado];

        if (coords) {
            this.map.setView(coords, 8);
            L.popup()
                .setLatLng(coords)
                .setContent(`<b>${estado}</b><br>Haz clic en el mapa para ajustar la ubicación`)
                .openOn(this.map);

            this._mostrarInfo(`Mapa centrado en ${estado}`);
        } else {
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
    _escapeHTML(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    window.editarSucursalDebug.controller = new EditarSucursalController();
});