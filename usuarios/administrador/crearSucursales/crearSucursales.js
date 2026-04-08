// crearSucursales.js - VERSIÓN SIN LOADING OVERLAY
import { SucursalManager, ESTADOS_MEXICO } from '/clases/sucursal.js';

let historialManager = null;

window.crearSucursalDebug = {
    estado: 'iniciando',
    controller: null
};

const LIMITES = {
    NOMBRE_SUCURSAL: 100,
    TIPO_SUCURSAL: 50,
    CIUDAD: 50,
    DIRECCION: 200,
    ZONA: 30,
    CONTACTO: 10,
    COORDENADA: 20
};

const COORDENADAS_ESTADOS = {
    "Aguascalientes": { lat: 21.8853, lng: -102.2916, rango: 1.5 },
    "Baja California": { lat: 30.8406, lng: -115.2838, rango: 2.5 },
    "Baja California Sur": { lat: 25.8378, lng: -111.9748, rango: 2.5 },
    "Campeche": { lat: 19.8301, lng: -90.5349, rango: 1.5 },
    "Chiapas": { lat: 16.7569, lng: -93.1292, rango: 1.8 },
    "Chihuahua": { lat: 28.6329, lng: -106.0691, rango: 2.5 },
    "Coahuila": { lat: 27.0587, lng: -101.7068, rango: 2.0 },
    "Colima": { lat: 19.2452, lng: -103.7241, rango: 1.0 },
    "Durango": { lat: 24.0277, lng: -104.6532, rango: 1.8 },
    "Guanajuato": { lat: 21.0190, lng: -101.2574, rango: 1.5 },
    "Guerrero": { lat: 17.4392, lng: -99.5451, rango: 1.8 },
    "Hidalgo": { lat: 20.0911, lng: -98.7624, rango: 1.2 },
    "Jalisco": { lat: 20.6595, lng: -103.3496, rango: 2.0 },
    "México": { lat: 19.2870, lng: -99.6544, rango: 1.5 },
    "Estado de México": { lat: 19.2870, lng: -99.6544, rango: 1.5 },
    "Ciudad de México": { lat: 19.4326, lng: -99.1332, rango: 0.8 },
    "Michoacán": { lat: 19.5665, lng: -101.7068, rango: 1.8 },
    "Morelos": { lat: 18.6813, lng: -99.1013, rango: 1.0 },
    "Nayarit": { lat: 21.7514, lng: -104.8455, rango: 1.5 },
    "Nuevo León": { lat: 25.5921, lng: -99.9962, rango: 1.8 },
    "Oaxaca": { lat: 17.0732, lng: -96.7266, rango: 2.0 },
    "Puebla": { lat: 19.0414, lng: -98.2062, rango: 1.5 },
    "Querétaro": { lat: 20.5888, lng: -100.3899, rango: 1.2 },
    "Quintana Roo": { lat: 19.1814, lng: -88.4794, rango: 1.8 },
    "San Luis Potosí": { lat: 22.1565, lng: -100.9855, rango: 1.8 },
    "Sinaloa": { lat: 24.8091, lng: -107.3940, rango: 2.0 },
    "Sonora": { lat: 29.2970, lng: -110.3309, rango: 2.5 },
    "Tabasco": { lat: 17.9892, lng: -92.9475, rango: 1.2 },
    "Tamaulipas": { lat: 24.2669, lng: -98.8362, rango: 2.0 },
    "Tlaxcala": { lat: 19.3181, lng: -98.2375, rango: 0.8 },
    "Veracruz": { lat: 19.1738, lng: -96.1342, rango: 2.0 },
    "Yucatán": { lat: 20.7099, lng: -89.0943, rango: 1.5 },
    "Zacatecas": { lat: 23.1273, lng: -102.8722, rango: 1.5 }
};

class CrearSucursalController {
    constructor() {
        this.sucursalManager = null;
        this.usuarioActual = null;

        this.map = null;
        this.marker = null;
        this.mapInitialized = false;

        this.numerosEmergencia = {};

        this.coordenadasTimeout = null;
        this.actualizandoDesdeMapa = false;
        this.actualizandoDesdeFormulario = false;
        this.busquedaTimeout = null;

        this.marcadorMovidoPorUsuario = false;
        this.camposFormularioModificados = false;
        this.ultimosDatosFormulario = {};

        this._init();
    }

    async _init() {
        try {
            this._cargarUsuario();
            if (!this.usuarioActual) {
                throw new Error('No se pudo cargar información del usuario');
            }
            await this._initHistorial();
            this.sucursalManager = new SucursalManager();
            this._configurarEventos();
            await this._cargarRegiones();
            this._cargarEstados();
            this._aplicarLimitesCaracteres();
            this._configurarSincronizacionCoordenadas();
            this._configurarValidacionUbicacion();
            this._configurarEventosEmergencia();
            this._configurarBusquedaDireccionTiempoReal();
            this._monitorearCambiosFormulario();
            setTimeout(() => this._inicializarMapa(), 500);
            window.crearSucursalDebug.controller = this;
        } catch (error) {
            // Error silencioso
        }
    }

    _monitorearCambiosFormulario() {
        const campos = [
            'nombreSucursal', 'tipoSucursal', 'regionSucursal', 'estadoSucursal',
            'ciudadSucursal', 'direccionSucursal', 'zonaSucursal', 'contactoSucursal'
        ];

        const guardarEstadoActual = () => {
            this.ultimosDatosFormulario = {};
            campos.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    this.ultimosDatosFormulario[id] = el.value;
                }
            });
        };

        const verificarCambios = () => {
            let haCambiado = false;
            for (const id of campos) {
                const el = document.getElementById(id);
                if (el && this.ultimosDatosFormulario[id] !== el.value) {
                    haCambiado = true;
                    break;
                }
            }
            this.camposFormularioModificados = haCambiado;
        };

        setTimeout(() => guardarEstadoActual(), 1000);

        campos.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', verificarCambios);
                el.addEventListener('change', verificarCambios);
            }
        });
    }

    // ========== BÚSQUEDA DE DIRECCIÓN EN TIEMPO REAL ==========
    _configurarBusquedaDireccionTiempoReal() {
        const direccionInput = document.getElementById('direccionSucursal');
        const suggestionsContainer = document.getElementById('direccionSuggestions');

        if (!direccionInput || !suggestionsContainer) return;

        let searchTimeout = null;

        direccionInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();

            if (searchTimeout) clearTimeout(searchTimeout);

            if (query.length < 3) {
                suggestionsContainer.classList.remove('active');
                suggestionsContainer.innerHTML = '';
                return;
            }

            this._mostrarCargandoSugerencias(direccionInput);

            searchTimeout = setTimeout(async () => {
                await this._buscarSugerenciasDireccion(query, suggestionsContainer, direccionInput);
                this._ocultarCargandoSugerencias(direccionInput);
            }, 500);
        });

        document.addEventListener('click', (e) => {
            if (!direccionInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                suggestionsContainer.classList.remove('active');
            }
        });

        direccionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                suggestionsContainer.classList.remove('active');
                this._buscarDireccionEnMapa();
            }
        });
    }

    _mostrarCargandoSugerencias(input) {
        const container = input.closest('.direccion-input-container');
        if (container && !container.querySelector('.search-loading-indicator')) {
            const loading = document.createElement('div');
            loading.className = 'search-loading-indicator';
            container.style.position = 'relative';
            container.appendChild(loading);
        }
    }

    _ocultarCargandoSugerencias(input) {
        const container = input.closest('.direccion-input-container');
        const loading = container?.querySelector('.search-loading-indicator');
        if (loading) loading.remove();
    }

    async _buscarSugerenciasDireccion(query, container, input) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', México')}&limit=5&countrycodes=mx&addressdetails=1&accept-language=es-MX,es`
            );
            const data = await response.json();

            if (data && data.length > 0) {
                container.innerHTML = data.map(item => `
                    <div class="suggestion-item" data-lat="${item.lat}" data-lon="${item.lon}" data-display="${this._escapeHTML(item.display_name)}">
                        <i class="fas fa-map-pin" style="margin-right: 8px;"></i>
                        ${this._escapeHTML(item.display_name.substring(0, 100))}
                    </div>
                `).join('');
                container.classList.add('active');

                container.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        const lat = parseFloat(item.dataset.lat);
                        const lon = parseFloat(item.dataset.lon);
                        const displayName = item.dataset.display;

                        input.value = displayName;
                        container.classList.remove('active');

                        if (this._validarCoordenadasMexico(lat, lon)) {
                            this.actualizandoDesdeMapa = true;
                            this._colocarMarcador({ lat: lat, lng: lon });
                            await this._obtenerInformacionUbicacion(lat, lon, true, false);
                            this.actualizandoDesdeMapa = false;
                        } else {
                            this._mostrarError('Dirección fuera de México');
                        }
                    });
                });
            } else {
                container.classList.remove('active');
            }
        } catch (error) {
            container.classList.remove('active');
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

    // ========== ACTUALIZAR COORDENADAS EN FORMULARIO ==========
    _actualizarCamposCoordenadas(lat, lng) {
        if (typeof lat !== 'number' || isNaN(lat) || typeof lng !== 'number' || isNaN(lng)) {
            return false;
        }

        const latFormateada = lat.toFixed(6);
        const lngFormateada = lng.toFixed(6);

        const latInput = document.getElementById('latitudSucursal');
        const lngInput = document.getElementById('longitudSucursal');

        if (latInput) {
            latInput.value = latFormateada;
            latInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (lngInput) {
            lngInput.value = lngFormateada;
            lngInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const mapLat = document.getElementById('mapLatitud');
        const mapLng = document.getElementById('mapLongitud');
        if (mapLat) mapLat.textContent = latFormateada;
        if (mapLng) mapLng.textContent = lngFormateada;

        return true;
    }

    // ========== SINCRONIZACIÓN BIDIRECCIONAL DE COORDENADAS ==========
    _configurarSincronizacionCoordenadas() {
        const latInput = document.getElementById('latitudSucursal');
        const lngInput = document.getElementById('longitudSucursal');
        const direccionInput = document.getElementById('direccionSucursal');
        const ciudadInput = document.getElementById('ciudadSucursal');
        const estadoSelect = document.getElementById('estadoSucursal');
        const zonaInput = document.getElementById('zonaSucursal');

        if (latInput && lngInput) {
            const handleCoordenadasChange = () => {
                if (this.actualizandoDesdeMapa) return;

                const lat = parseFloat(latInput.value);
                const lng = parseFloat(lngInput.value);

                if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                    if (this._validarCoordenadasMexico(lat, lng)) {
                        this.actualizandoDesdeFormulario = true;
                        this._colocarMarcador({ lat: lat, lng: lng });
                        this.actualizandoDesdeFormulario = false;

                        const mapLat = document.getElementById('mapLatitud');
                        const mapLng = document.getElementById('mapLongitud');
                        if (mapLat) mapLat.textContent = lat.toFixed(6);
                        if (mapLng) mapLng.textContent = lng.toFixed(6);

                        if (this.coordenadasTimeout) clearTimeout(this.coordenadasTimeout);
                        this.coordenadasTimeout = setTimeout(async () => {
                            await this._obtenerInformacionUbicacion(lat, lng, false, false);
                        }, 800);
                    } else {
                        latInput.classList.add('is-invalid');
                        lngInput.classList.add('is-invalid');
                        this._mostrarError('Coordenadas fuera del territorio mexicano');
                    }
                }
            };

            latInput.addEventListener('input', handleCoordenadasChange);
            lngInput.addEventListener('change', handleCoordenadasChange);
        }

        if (direccionInput) {
            let direccionTimeout = null;
            direccionInput.addEventListener('blur', async () => {
                const direccion = direccionInput.value.trim();
                if (direccion && !this.actualizandoDesdeMapa) {
                    if (direccionTimeout) clearTimeout(direccionTimeout);
                    direccionTimeout = setTimeout(async () => {
                        await this._geocodificarDireccion(direccion);
                    }, 500);
                }
            });
        }

        if (ciudadInput && estadoSelect) {
            const handleUbicacionChange = async () => {
                if (this.actualizandoDesdeMapa) return;
                const ciudad = ciudadInput.value.trim();
                const estado = estadoSelect.value;
                if (ciudad && estado && !this.actualizandoDesdeMapa) {
                    if (this.ubicacionTimeout) clearTimeout(this.ubicacionTimeout);
                    this.ubicacionTimeout = setTimeout(async () => {
                        await this._geocodificarCiudadEstado(ciudad, estado);
                    }, 800);
                }
            };

            ciudadInput.addEventListener('blur', handleUbicacionChange);
            estadoSelect.addEventListener('change', handleUbicacionChange);
        }

        if (zonaInput) {
            zonaInput.addEventListener('blur', async () => {
                if (this.actualizandoDesdeMapa) return;
                const zona = zonaInput.value.trim();
                const ciudad = ciudadInput?.value.trim();
                const estado = estadoSelect?.value;
                if (zona && ciudad && estado) {
                    await this._geocodificarZona(zona, ciudad, estado);
                }
            });
        }
    }

    async _geocodificarDireccion(direccion) {
        if (!direccion) return;

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion + ', México')}&limit=1&countrycodes=mx&addressdetails=1&accept-language=es-MX,es`
            );
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                if (this._validarCoordenadasMexico(lat, lon)) {
                    this.actualizandoDesdeMapa = true;
                    this._colocarMarcador({ lat: lat, lng: lon });
                    await this._obtenerInformacionUbicacion(lat, lon, true, false);
                    this.actualizandoDesdeMapa = false;
                }
            }
        } catch (error) {
            // Error silencioso
        }
    }

    async _geocodificarCiudadEstado(ciudad, estado) {
        if (!ciudad || !estado) return;

        try {
            const query = `${ciudad}, ${estado}, México`;
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=mx&addressdetails=1&accept-language=es-MX,es`
            );
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                if (this._validarCoordenadasMexico(lat, lon)) {
                    this.actualizandoDesdeMapa = true;
                    this._colocarMarcador({ lat: lat, lng: lon });
                    this.actualizandoDesdeMapa = false;
                }
            }
        } catch (error) {
            // Error silencioso
        }
    }

    async _geocodificarZona(zona, ciudad, estado) {
        if (!zona || !ciudad || !estado) return;

        try {
            const query = `${zona}, ${ciudad}, ${estado}, México`;
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=mx&addressdetails=1&accept-language=es-MX,es`
            );
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                if (this._validarCoordenadasMexico(lat, lon)) {
                    this.actualizandoDesdeMapa = true;
                    this._colocarMarcador({ lat: lat, lng: lon });
                    this.actualizandoDesdeMapa = false;
                }
            }
        } catch (error) {
            // Error silencioso
        }
    }

    _configurarValidacionUbicacion() {
        const estadoSelect = document.getElementById('estadoSucursal');
        const ciudadInput = document.getElementById('ciudadSucursal');
        const direccionInput = document.getElementById('direccionSucursal');

        if (estadoSelect) {
            estadoSelect.addEventListener('change', async () => {
                await this._validarConsistenciaConMapa();
            });
        }

        if (ciudadInput) {
            ciudadInput.addEventListener('blur', async () => {
                await this._validarConsistenciaConMapa();
            });
        }

        if (direccionInput) {
            direccionInput.addEventListener('blur', async () => {
                await this._validarConsistenciaConMapa();
            });
        }
    }

    async _validarConsistenciaConMapa() {
        const errores = [];

        const latInput = document.getElementById('latitudSucursal');
        const lngInput = document.getElementById('longitudSucursal');
        const estadoSelect = document.getElementById('estadoSucursal');
        const ciudadInput = document.getElementById('ciudadSucursal');
        const direccionInput = document.getElementById('direccionSucursal');

        const lat = parseFloat(latInput?.value);
        const lng = parseFloat(lngInput?.value);
        const estado = estadoSelect?.value;

        [estadoSelect, ciudadInput, direccionInput, latInput, lngInput].forEach(el => {
            if (el) el.classList.remove('is-invalid');
        });

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
            return errores;
        }

        if (estado && COORDENADAS_ESTADOS[estado]) {
            const estadoCoords = COORDENADAS_ESTADOS[estado];
            const distancia = this._calcularDistancia(lat, lng, estadoCoords.lat, estadoCoords.lng);
            const rangoPermitido = estadoCoords.rango || 2.0;

            if (distancia > rangoPermitido) {
                errores.push(`⚠️ Las coordenadas están fuera del estado "${estado}". Distancia aproximada: ${(distancia * 111).toFixed(0)} km`);
                estadoSelect?.classList.add('is-invalid');
                latInput?.classList.add('is-invalid');
                lngInput?.classList.add('is-invalid');
            }
        }

        const errorContainer = document.getElementById('ubicacionErrores');
        if (errorContainer) {
            if (errores.length > 0) {
                errorContainer.innerHTML = errores.map(err => `<div class="invalid-feedback d-block">${err}</div>`).join('');
                errorContainer.style.display = 'block';
            } else {
                errorContainer.innerHTML = '';
                errorContainer.style.display = 'none';
            }
        }

        return errores;
    }

    async _obtenerInformacionUbicacion(lat, lng, actualizarTodosCampos = true, mostrarNotificaciones = true) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es-MX,es`, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data && data.address) {
                const address = data.address;

                const direccionInput = document.getElementById('direccionSucursal');
                if (direccionInput && (actualizarTodosCampos || !direccionInput.value.trim())) {
                    direccionInput.value = data.display_name;
                }

                const ciudadInput = document.getElementById('ciudadSucursal');
                let ciudad = address.city || address.town || address.village || address.municipality || address.county || address.state_district;

                if (ciudad && ciudad.toLowerCase().endsWith(' city')) ciudad = ciudad.slice(0, -5);
                if (ciudad && ciudad.toLowerCase().endsWith(' town')) ciudad = ciudad.slice(0, -5);

                if (ciudadInput && ciudad && (actualizarTodosCampos || !ciudadInput.value.trim())) {
                    ciudadInput.value = ciudad;
                }

                const estadoSelect = document.getElementById('estadoSucursal');
                if (estadoSelect && address.state) {
                    const estadoObtenido = address.state;
                    const mapaEstados = {
                        'Ciudad de México': ['CDMX', 'Ciudad de Mexico', 'Mexico City', 'Distrito Federal', 'DF'],
                        'Estado de México': ['México', 'Mexico', 'Edomex', 'Estado de Mexico'],
                        'Veracruz': ['Veracruz de Ignacio de la Llave'],
                        'San Luis Potosí': ['San Luis Potosi'],
                        'Nuevo León': ['Nuevo Leon'],
                        'Michoacán': ['Michoacan'],
                        'Querétaro': ['Queretaro', 'Santiago de Querétaro'],
                        'Yucatán': ['Yucatan']
                    };

                    let estadoEncontrado = false;
                    for (let i = 0; i < estadoSelect.options.length; i++) {
                        if (estadoSelect.options[i].text === estadoObtenido) {
                            if (actualizarTodosCampos || !estadoSelect.value) {
                                estadoSelect.selectedIndex = i;
                                estadoEncontrado = true;
                            }
                            break;
                        }
                    }

                    if (!estadoEncontrado) {
                        for (const [estadoReal, alternativas] of Object.entries(mapaEstados)) {
                            if (alternativas.some(alt => alt.toLowerCase() === estadoObtenido.toLowerCase())) {
                                for (let i = 0; i < estadoSelect.options.length; i++) {
                                    if (estadoSelect.options[i].text === estadoReal) {
                                        if (actualizarTodosCampos || !estadoSelect.value) {
                                            estadoSelect.selectedIndex = i;
                                            estadoEncontrado = true;
                                        }
                                        break;
                                    }
                                }
                                break;
                            }
                        }
                    }
                }

                const zonaInput = document.getElementById('zonaSucursal');
                if (zonaInput) {
                    let zona = address.suburb || address.neighbourhood || address.city_district || address.district || address.quarter || '';

                    if (!zona && data.display_name) {
                        const partes = data.display_name.split(',');
                        if (partes.length >= 2) {
                            const posibleZona = partes[1].trim();
                            if (posibleZona.length > 2 && !posibleZona.match(/^\d+$/)) {
                                zona = posibleZona;
                            }
                        }
                    }

                    if (zona && (actualizarTodosCampos || !zonaInput.value.trim())) {
                        zonaInput.value = zona;
                    }
                }

                this._actualizarCamposCoordenadas(lat, lng);

                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    // ========== NÚMEROS DE EMERGENCIA ==========
    _configurarEventosEmergencia() {
        const btnAdd = document.getElementById('btnAddEmergency');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => this._agregarEmergencia());
        }

        const telefonoInput = document.getElementById('emergencyTelefono');
        if (telefonoInput) {
            telefonoInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
            });
        }

        const institucionInput = document.getElementById('emergencyInstitucion');
        const numeroInput = document.getElementById('emergencyTelefono');
        if (institucionInput && numeroInput) {
            const handleEnter = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._agregarEmergencia();
                }
            };
            institucionInput.addEventListener('keypress', handleEnter);
            numeroInput.addEventListener('keypress', handleEnter);
        }

        this._actualizarListaEmergencia();
    }

    _agregarEmergencia() {
        const institucion = document.getElementById('emergencyInstitucion')?.value.trim();
        const telefono = document.getElementById('emergencyTelefono')?.value.trim();

        if (!institucion) {
            this._mostrarError('Ingresa el nombre de la institución');
            document.getElementById('emergencyInstitucion')?.focus();
            return;
        }

        if (!telefono) {
            this._mostrarError('Ingresa el número telefónico');
            document.getElementById('emergencyTelefono')?.focus();
            return;
        }

        const telefonoLimpio = telefono.replace(/\D/g, '');
        if (telefonoLimpio.length < 3) {
            this._mostrarError('El número debe tener al menos 3 dígitos');
            return;
        }

        if (this.numerosEmergencia[institucion]) {
            Swal.fire({
                icon: 'question',
                title: '¿Reemplazar número?',
                text: `Ya existe un número para "${institucion}". ¿Deseas reemplazarlo?`,
                showCancelButton: true,
                confirmButtonText: 'Sí, reemplazar',
                cancelButtonText: 'Cancelar',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)'
            }).then((result) => {
                if (result.isConfirmed) {
                    this.numerosEmergencia[institucion] = telefonoLimpio;
                    this._actualizarListaEmergencia();
                    this._limpiarCamposEmergencia();
                    this._mostrarExito(`${institucion}: número actualizado`);
                }
            });
            return;
        }

        this.numerosEmergencia[institucion] = telefonoLimpio;
        this._actualizarListaEmergencia();
        this._limpiarCamposEmergencia();
        this._mostrarExito(`${institucion}: ${this._formatearTelefono(telefonoLimpio)} agregado`);
    }

    _limpiarCamposEmergencia() {
        const institucionInput = document.getElementById('emergencyInstitucion');
        const telefonoInput = document.getElementById('emergencyTelefono');
        if (institucionInput) institucionInput.value = '';
        if (telefonoInput) telefonoInput.value = '';
        document.getElementById('emergencyInstitucion')?.focus();
    }

    _actualizarListaEmergencia() {
        const container = document.getElementById('emergencyList');
        if (!container) return;

        if (Object.keys(this.numerosEmergencia).length === 0) {
            container.innerHTML = '<div class="empty-emergency"><i class="fas fa-phone-slash"></i> No hay números de emergencia configurados</div>';
            return;
        }

        container.innerHTML = Object.entries(this.numerosEmergencia)
            .map(([institucion, telefono]) => `
                <div class="emergency-item">
                    <div class="emergency-item-info">
                        <span class="emergency-institucion"><i class="fas fa-building"></i> ${this._escapeHTML(institucion)}</span>
                        <span class="emergency-telefono"><i class="fas fa-phone"></i> ${this._formatearTelefono(telefono)}</span>
                    </div>
                    <button type="button" class="btn-remove-emergency" onclick="window.crearSucursalDebug.controller._eliminarEmergencia('${this._escapeHTML(institucion)}')">
                        <i class="fas fa-trash-alt"></i> Eliminar
                    </button>
                </div>
            `)
            .join('');
    }

    _formatearTelefono(numero) {
        const numStr = String(numero);
        if (numStr.length === 3) return numStr;
        if (numStr.length === 10) {
            return `${numStr.slice(0, 3)} ${numStr.slice(3, 6)} ${numStr.slice(6)}`;
        }
        if (numStr.length === 8) {
            return `${numStr.slice(0, 4)} ${numStr.slice(4)}`;
        }
        return numStr;
    }

    _eliminarEmergencia(institucion) {
        Swal.fire({
            icon: 'question',
            title: 'Eliminar número',
            text: `¿Deseas eliminar el número de ${institucion}?`,
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        }).then((result) => {
            if (result.isConfirmed) {
                delete this.numerosEmergencia[institucion];
                this._actualizarListaEmergencia();
                this._mostrarExito(`${institucion} eliminado`);
            }
        });
    }

    _getNumerosEmergencia() {
        return this.numerosEmergencia;
    }

    // ========== GUARDADO ==========
    async _validarYGuardar() {
        const erroresConsistencia = await this._validarConsistenciaConMapa();

        if (erroresConsistencia.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: '⚠️ Inconsistencia en ubicación',
                html: `<div style="text-align: left;">
                    <p>Se detectaron las siguientes inconsistencias:</p>
                    <ul style="color: #ffaa00;">${erroresConsistencia.map(err => `<li>${err}</li>`).join('')}</ul>
                    <p>¿Deseas continuar de todos modos?</p>
                </div>`,
                showCancelButton: true,
                confirmButtonText: 'Sí, continuar',
                cancelButtonText: 'Revisar datos',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)'
            }).then((result) => {
                if (result.isConfirmed) {
                    this._validarCamposYGuardar();
                }
            });
            return;
        }

        this._validarCamposYGuardar();
    }

    _validarCamposYGuardar() {
        const errores = this._validarCamposObligatorios();

        if (errores.length > 0) {
            Swal.fire({
                icon: 'error',
                title: 'Error de validación',
                html: `<div style="text-align: left;">${errores.map(err => `<p>• ${err}</p>`).join('')}</div>`,
                confirmButtonText: 'CORREGIR',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                confirmButtonColor: '#dc3545'
            });
            return;
        }

        this._confirmarGuardado();
    }

    _validarCamposObligatorios() {
        const errores = [];

        const nombreInput = document.getElementById('nombreSucursal');
        const tipoInput = document.getElementById('tipoSucursal');
        const regionSelect = document.getElementById('regionSucursal');
        const estadoSelect = document.getElementById('estadoSucursal');
        const ciudadInput = document.getElementById('ciudadSucursal');
        const direccionInput = document.getElementById('direccionSucursal');
        const latitudInput = document.getElementById('latitudSucursal');
        const longitudInput = document.getElementById('longitudSucursal');
        const contactoInput = document.getElementById('contactoSucursal');

        [nombreInput, tipoInput, regionSelect, estadoSelect, ciudadInput,
            direccionInput, latitudInput, longitudInput, contactoInput].forEach(el => {
                if (el) el.classList.remove('is-invalid');
            });

        const nombre = nombreInput?.value.trim();
        if (!nombre) {
            nombreInput?.classList.add('is-invalid');
            errores.push('El nombre de la sucursal es obligatorio');
        } else if (nombre.length < 3) {
            nombreInput?.classList.add('is-invalid');
            errores.push('El nombre debe tener al menos 3 caracteres');
        }

        const tipo = tipoInput?.value.trim();
        if (!tipo) {
            tipoInput?.classList.add('is-invalid');
            errores.push('El tipo de sucursal es obligatorio');
        }

        const regionId = regionSelect?.value;
        if (!regionId) {
            regionSelect?.classList.add('is-invalid');
            errores.push('Debe seleccionar una región');
        }

        const estado = estadoSelect?.value;
        if (!estado) {
            estadoSelect?.classList.add('is-invalid');
            errores.push('Debe seleccionar un estado');
        }

        const ciudad = ciudadInput?.value.trim();
        if (!ciudad) {
            ciudadInput?.classList.add('is-invalid');
            errores.push('La ciudad es obligatoria');
        }

        const direccion = direccionInput?.value.trim();
        if (!direccion) {
            direccionInput?.classList.add('is-invalid');
            errores.push('La dirección es obligatoria');
        }

        const latitud = latitudInput?.value.trim();
        if (!latitud) {
            latitudInput?.classList.add('is-invalid');
            errores.push('La latitud es obligatoria');
        } else if (isNaN(latitud)) {
            latitudInput?.classList.add('is-invalid');
            errores.push('La latitud debe ser un número');
        } else if (!this._validarCoordenadasMexico(parseFloat(latitud), parseFloat(longitudInput?.value))) {
            latitudInput?.classList.add('is-invalid');
            errores.push('La latitud debe estar dentro de México');
        }

        const longitud = longitudInput?.value.trim();
        if (!longitud) {
            longitudInput?.classList.add('is-invalid');
            errores.push('La longitud es obligatoria');
        } else if (isNaN(longitud)) {
            longitudInput?.classList.add('is-invalid');
            errores.push('La longitud debe ser un número');
        } else if (!this._validarCoordenadasMexico(parseFloat(latitudInput?.value), parseFloat(longitud))) {
            longitudInput?.classList.add('is-invalid');
            errores.push('La longitud debe estar dentro de México');
        }

        const contacto = contactoInput?.value.trim();
        if (!contacto) {
            contactoInput?.classList.add('is-invalid');
            errores.push('El teléfono de contacto es obligatorio');
        } else {
            const telefonoLimpio = contacto.replace(/\D/g, '');
            if (telefonoLimpio.length < 10) {
                contactoInput?.classList.add('is-invalid');
                errores.push('El teléfono debe tener 10 dígitos');
            }
        }

        return errores;
    }

    _confirmarGuardado() {
        const datos = this._obtenerDatosFormulario();
        const totalEmergencias = Object.keys(this.numerosEmergencia).length;

        Swal.fire({
            title: 'Crear sucursal',
            html: `<div style="text-align: left;">
                <p><strong>Nombre:</strong> ${this._escapeHTML(datos.nombre)}</p>
                <p><strong>Tipo:</strong> ${this._escapeHTML(datos.tipo)}</p>
                <p><strong>Región:</strong> ${this._escapeHTML(datos.regionNombre)}</p>
                <p><strong>Estado:</strong> ${this._escapeHTML(datos.estado)}</p>
                <p><strong>Ciudad:</strong> ${this._escapeHTML(datos.ciudad)}</p>
                <p><strong>Dirección:</strong> ${this._escapeHTML(datos.direccion)}</p>
                <p><strong>Zona/Colonia:</strong> ${this._escapeHTML(datos.zona || 'No especificada')}</p>
                <p><strong>Contacto:</strong> ${this._escapeHTML(datos.contacto)}</p>
                <p><strong>Coordenadas:</strong> ${datos.latitud}, ${datos.longitud}</p>
                ${totalEmergencias > 0 ? `<p><strong>📞 Números de emergencia:</strong> ${totalEmergencias} configurado(s)</p>` : ''}
            </div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'CONFIRMAR',
            cancelButtonText: 'CANCELAR',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        }).then((result) => {
            if (result.isConfirmed) this._guardarSucursal(datos);
        });
    }

    _obtenerDatosFormulario() {
        const regionSelect = document.getElementById('regionSucursal');
        const regionOption = regionSelect?.options[regionSelect.selectedIndex];
        const regionNombre = regionOption?.getAttribute('data-region-nombre') || regionOption?.textContent || '';

        return {
            nombre: document.getElementById('nombreSucursal')?.value.trim() || '',
            tipo: document.getElementById('tipoSucursal')?.value.trim() || '',
            regionId: document.getElementById('regionSucursal')?.value || '',
            regionNombre: regionNombre,
            estado: document.getElementById('estadoSucursal')?.value || '',
            ciudad: document.getElementById('ciudadSucursal')?.value.trim() || '',
            direccion: document.getElementById('direccionSucursal')?.value.trim() || '',
            zona: document.getElementById('zonaSucursal')?.value.trim() || '',
            contacto: document.getElementById('contactoSucursal')?.value.trim() || '',
            latitud: document.getElementById('latitudSucursal')?.value || '',
            longitud: document.getElementById('longitudSucursal')?.value || ''
        };
    }

    async _guardarSucursal(datos) {
        const btnCrear = document.getElementById('crearSucursalBtn');
        const originalHTML = btnCrear?.innerHTML || '<i class="fas fa-check"></i>Crear Sucursal';

        try {
            if (btnCrear) {
                btnCrear.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
                btnCrear.disabled = true;
            }

            Swal.fire({ title: 'Creando sucursal...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

            const numerosEmergencia = this._getNumerosEmergencia();

            const sucursalData = {
                nombre: datos.nombre, tipo: datos.tipo, contacto: datos.contacto,
                direccion: datos.direccion, ciudad: datos.ciudad, estado: datos.estado,
                zona: datos.zona, regionId: datos.regionId, latitud: datos.latitud,
                longitud: datos.longitud, numerosEmergencia: numerosEmergencia
            };

            const nuevaSucursal = await this.sucursalManager.crearSucursal(sucursalData, { currentUser: this.usuarioActual });

            Swal.close();
            await this._registrarCreacionSucursal(nuevaSucursal, datos);

            const totalEmergencias = Object.keys(numerosEmergencia).length;

            await Swal.fire({
                icon: 'success',
                title: '¡Sucursal creada!',
                html: `<p><strong>${this._escapeHTML(datos.nombre)}</strong><br>${this._escapeHTML(datos.ciudad)}, ${this._escapeHTML(datos.estado)}</p>
                       <p><strong>Región:</strong> ${this._escapeHTML(datos.regionNombre)}</p>
                       ${totalEmergencias > 0 ? `<p><strong>✅ ${totalEmergencias} número(s) de emergencia configurado(s)</strong></p>` : ''}`,
                showCancelButton: true,
                confirmButtonText: 'CREAR OTRA',
                cancelButtonText: 'IR A SUCURSALES',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                confirmButtonColor: '#28a745',
                cancelButtonColor: '#dc3545'
            }).then((result) => {
                if (result.isConfirmed) this._limpiarFormulario();
                else this._volverALista();
            });

        } catch (error) {
            Swal.close();
            this._mostrarError(error.message || 'No se pudo crear la sucursal');
        } finally {
            if (btnCrear) {
                btnCrear.innerHTML = originalHTML;
                btnCrear.disabled = false;
            }
        }
    }

    _limpiarFormulario() {
        const form = document.getElementById('sucursalForm');
        if (form) form.reset();

        ['regionSucursal', 'estadoSucursal'].forEach(id => {
            const select = document.getElementById(id);
            if (select) select.selectedIndex = 0;
        });

        this.numerosEmergencia = {};
        this._actualizarListaEmergencia();
        this._cargarRegiones();

        if (this.map && this.marker) {
            const defaultLat = 23.6345, defaultLng = -102.5528;
            this._colocarMarcador({ lat: defaultLat, lng: defaultLng });
        }

        const errorContainer = document.getElementById('ubicacionErrores');
        if (errorContainer) {
            errorContainer.innerHTML = '';
            errorContainer.style.display = 'none';
        }

        this.camposFormularioModificados = false;
        this.marcadorMovidoPorUsuario = false;
    }

    // ========== FUNCIONES DEL MAPA ==========
    _inicializarMapa() {
        try {
            const defaultLat = 23.6345, defaultLng = -102.5528, defaultZoom = 5;

            this.map = L.map('sucursalMap', {
                maxBounds: this._obtenerLimitesMexico(),
                maxBoundsViscosity: 1.0,
                minZoom: 5,
                maxZoom: 18,
                zoomControl: false
            }).setView([defaultLat, defaultLng], defaultZoom);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap | Centinela-MX',
                maxZoom: 19
            }).addTo(this.map);

            L.control.zoom({ position: 'bottomright' }).addTo(this.map);

            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: '<i class="fas fa-map-marker-alt" style="font-size: 30px; color: var(--color-accent-primary);"></i>',
                iconSize: [30, 30],
                popupAnchor: [0, -15]
            });

            this.marker = L.marker([defaultLat, defaultLng], { draggable: true, icon: customIcon }).addTo(this.map);
            this.marker.bindPopup(`📍 Sucursal<br>Arrastra para ajustar`).openPopup();

            this._actualizarCamposCoordenadas(defaultLat, defaultLng);

            this.marker.on('dragend', async (event) => {
                const position = event.target.getLatLng();

                const hayDatosEnFormulario = this._verificarDatosFormulario();

                if (hayDatosEnFormulario && !this.actualizandoDesdeFormulario && !this.marcadorMovidoPorUsuario) {
                    const result = await Swal.fire({
                        title: '¿Mover ubicación?',
                        html: `<p>Al mover el marcador, se actualizarán automáticamente:</p>
                               <ul style="text-align: left;">
                                   <li>📍 Dirección</li>
                                   <li>🏙️ Ciudad</li>
                                   <li>🗺️ Estado</li>
                                   <li>📍 Zona/Colonia</li>
                                   <li>📐 Latitud y Longitud (campos del formulario y panel)</li>
                               </ul>
                               <p>¿Deseas continuar?</p>`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, actualizar',
                        cancelButtonText: 'Cancelar',
                        confirmButtonColor: '#3085d6',
                        cancelButtonColor: '#d33',
                        background: 'var(--color-bg-secondary)',
                        color: 'var(--color-text-primary)'
                    });

                    if (!result.isConfirmed) {
                        const latActual = parseFloat(document.getElementById('latitudSucursal')?.value || defaultLat);
                        const lngActual = parseFloat(document.getElementById('longitudSucursal')?.value || defaultLng);
                        if (!isNaN(latActual) && !isNaN(lngActual)) {
                            this.marker.setLatLng([latActual, lngActual]);
                            this.map.setView([latActual, lngActual], this.map.getZoom());
                        }
                        return;
                    }
                }

                this.marcadorMovidoPorUsuario = true;

                if (this._validarCoordenadasMexico(position.lat, position.lng)) {
                    this.actualizandoDesdeMapa = true;
                    this._actualizarCamposCoordenadas(position.lat, position.lng);
                    await this._obtenerInformacionUbicacion(position.lat, position.lng, true, false);
                    this.actualizandoDesdeMapa = false;
                } else {
                    const ultimaLat = parseFloat(document.getElementById('latitudSucursal')?.value || defaultLat);
                    const ultimaLng = parseFloat(document.getElementById('longitudSucursal')?.value || defaultLng);
                    this._colocarMarcador({ lat: ultimaLat, lng: ultimaLng });
                    this._mostrarError('Ubicación fuera de México');
                }

                setTimeout(() => {
                    this.marcadorMovidoPorUsuario = false;
                }, 500);
            });

            this.map.on('click', async (e) => {
                const { lat, lng } = e.latlng;

                const hayDatosEnFormulario = this._verificarDatosFormulario();

                if (hayDatosEnFormulario && !this.actualizandoDesdeFormulario) {
                    const result = await Swal.fire({
                        title: '¿Cambiar ubicación?',
                        html: `<p>Al hacer clic en el mapa, se actualizarán los campos del formulario con la nueva ubicación.</p>
                               <p>¿Deseas continuar?</p>`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, actualizar',
                        cancelButtonText: 'Cancelar',
                        background: 'var(--color-bg-secondary)',
                        color: 'var(--color-text-primary)'
                    });

                    if (!result.isConfirmed) return;
                }

                if (this._validarCoordenadasMexico(lat, lng)) {
                    this.actualizandoDesdeMapa = true;
                    this._colocarMarcador({ lat: lat, lng: lng });
                    await this._obtenerInformacionUbicacion(lat, lng, true, false);
                    this.actualizandoDesdeMapa = false;
                } else {
                    this._mostrarError('Selecciona dentro de México');
                }
            });

            this._actualizarCoordenadasMapa(defaultLat, defaultLng);
            this.mapInitialized = true;
            this._configurarEventosMapa();
        } catch (error) {
            // Error silencioso
        }
    }

    _verificarDatosFormulario() {
        const camposRelevantes = [
            'nombreSucursal', 'tipoSucursal', 'regionSucursal', 'estadoSucursal',
            'ciudadSucursal', 'direccionSucursal', 'zonaSucursal', 'contactoSucursal'
        ];

        for (const id of camposRelevantes) {
            const el = document.getElementById(id);
            if (el && el.value && el.value.trim() !== '') {
                if (el.tagName === 'SELECT') {
                    if (el.value && el.value !== '') return true;
                } else {
                    return true;
                }
            }
        }
        return false;
    }

    _obtenerLimitesMexico() {
        return L.latLngBounds(L.latLng(14.5, -118.5), L.latLng(33.0, -86.5));
    }

    _validarCoordenadasMexico(lat, lng) {
        return lat >= 14.5 && lat <= 33.0 && lng >= -118.5 && lng <= -86.5;
    }

    _configurarEventosMapa() {
        document.getElementById('btnCentrarMapa')?.addEventListener('click', () => {
            const lat = parseFloat(document.getElementById('latitudSucursal').value);
            const lng = parseFloat(document.getElementById('longitudSucursal').value);
            if (!isNaN(lat) && !isNaN(lng) && this._validarCoordenadasMexico(lat, lng)) {
                this.map.setView([lat, lng], 15);
            }
        });

        document.getElementById('btnBuscarDireccion')?.addEventListener('click', () => this._buscarDireccionEnMapa());
        document.getElementById('btnObtenerUbicacion')?.addEventListener('click', () => this._obtenerUbicacionActual());
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

        if (typeof lat !== 'number' || isNaN(lat) || typeof lng !== 'number' || isNaN(lng)) {
            return;
        }

        this.marker.setLatLng([lat, lng]);
        this.map.setView([lat, lng], 15);
        this._actualizarCoordenadasMapa(lat, lng);
    }

    _actualizarCoordenadasMapa(lat, lng) {
        if (typeof lat !== 'number' || isNaN(lat) || typeof lng !== 'number' || isNaN(lng)) {
            return;
        }

        const latF = Number(lat).toFixed(6);
        const lngF = Number(lng).toFixed(6);

        if (!this.actualizandoDesdeFormulario) {
            this._actualizarCamposCoordenadas(lat, lng);
        }

        const mLat = document.getElementById('mapLatitud');
        const mLng = document.getElementById('mapLongitud');
        if (mLat) mLat.textContent = latF;
        if (mLng) mLng.textContent = lngF;
    }

    async _buscarDireccionEnMapa() {
        const direccion = document.getElementById('direccionSucursal').value;
        if (!direccion) {
            this._mostrarError('Ingresa una dirección');
            return;
        }

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion + ', México')}&limit=1&countrycodes=mx&addressdetails=1&accept-language=es-MX,es`);
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
                if (this._validarCoordenadasMexico(lat, lon)) {
                    this.actualizandoDesdeMapa = true;
                    this._colocarMarcador({ lat: lat, lng: lon });
                    await this._obtenerInformacionUbicacion(lat, lon, true, false);
                    this.actualizandoDesdeMapa = false;
                    this._mostrarExito('Dirección encontrada 📍');
                } else {
                    this._mostrarError('Dirección fuera de México');
                }
            } else {
                this._mostrarError('No se encontró la dirección');
            }
        } catch (error) {
            this._mostrarError('Error al buscar dirección');
        }
    }

    _obtenerUbicacionActual() {
        if (!navigator.geolocation) {
            this._mostrarError('Geolocalización no soportada');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;

                    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
                        throw new Error('Coordenadas inválidas');
                    }

                    if (this._validarCoordenadasMexico(latitude, longitude)) {
                        this.actualizandoDesdeMapa = true;
                        this._colocarMarcador({ lat: latitude, lng: longitude });
                        await this._obtenerInformacionUbicacion(latitude, longitude, true, false);
                        this.actualizandoDesdeMapa = false;
                        this._mostrarExito('Ubicación actual obtenida');
                    } else {
                        this._mostrarError('Ubicación fuera de México');
                    }
                } catch (error) {
                    this._mostrarError('Error al procesar la ubicación');
                }
            },
            (error) => {
                let mensaje = 'No se pudo obtener la ubicación';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        mensaje = 'Permiso denegado. Activa la ubicación en tu navegador';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensaje = 'Información de ubicación no disponible';
                        break;
                    case error.TIMEOUT:
                        mensaje = 'Tiempo de espera agotado';
                        break;
                }
                this._mostrarError(mensaje);
            }
        );
    }

    // ========== MÉTODOS AUXILIARES ==========
    _calcularDistancia(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this._toRad(lat2 - lat1);
        const dLng = this._toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c / 111;
    }

    _toRad(degrees) {
        return degrees * (Math.PI / 180);
    }

    async _initHistorial() {
        try {
            const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
            historialManager = new HistorialUsuarioManager();
        } catch (error) {
            // Error silencioso
        }
    }

    async _registrarCreacionSucursal(sucursal, datos) {
        if (!historialManager) return;
        try {
            await historialManager.registrarActividad({
                usuario: this.usuarioActual,
                tipo: 'crear',
                modulo: 'sucursales',
                descripcion: `Creó sucursal: ${datos.nombre}`,
                detalles: { sucursalId: sucursal.id, ...datos }
            });
        } catch (error) {
            // Error silencioso
        }
    }

    _cargarUsuario() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                this.usuarioActual = {
                    id: adminData.id || `admin_${Date.now()}`,
                    uid: adminData.uid || adminData.id,
                    nombreCompleto: adminData.nombreCompleto || 'Administrador',
                    organizacion: adminData.organizacion || 'Sin organización',
                    organizacionCamelCase: adminData.organizacionCamelCase || this._generarCamelCase(adminData.organizacion),
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
                    organizacionCamelCase: userData.organizacionCamelCase || this._generarCamelCase(userData.organizacion || userData.empresa),
                    correo: userData.correo || userData.email || ''
                };
                return;
            }
            this.usuarioActual = {
                id: `admin_${Date.now()}`,
                uid: `admin_${Date.now()}`,
                nombreCompleto: 'Administrador',
                organizacion: 'pollos Ray',
                organizacionCamelCase: 'pollosRay',
                correo: 'admin@centinela.com'
            };
        } catch (error) {
            // Error silencioso
            throw error;
        }
    }

    _generarCamelCase(texto) {
        if (!texto || typeof texto !== 'string') return 'sinOrganizacion';
        return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
    }

    _aplicarLimitesCaracteres() {
        const campos = [
            { id: 'nombreSucursal', limite: LIMITES.NOMBRE_SUCURSAL, nombre: 'Nombre' },
            { id: 'tipoSucursal', limite: LIMITES.TIPO_SUCURSAL, nombre: 'Tipo' },
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
                if (valor.length > LIMITES.CONTACTO) valor = valor.substring(0, LIMITES.CONTACTO);
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

    _configurarEventos() {
        try {
            document.getElementById('btnVolverLista')?.addEventListener('click', () => this._volverALista());
            document.getElementById('cancelarBtn')?.addEventListener('click', () => this._cancelarCreacion());
            document.getElementById('crearSucursalBtn')?.addEventListener('click', (e) => { e.preventDefault(); this._validarYGuardar(); });
            document.getElementById('sucursalForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._validarYGuardar(); });
        } catch (error) {
            // Error silencioso
        }
    }

    async _cargarRegiones() {
        try {
            const select = document.getElementById('regionSucursal');
            if (!select) return;
            select.innerHTML = '<option value="">-- Cargando regiones... --</option>';
            const { RegionManager } = await import('/clases/region.js');
            const regionManager = new RegionManager();
            const regiones = await regionManager.getRegionesByOrganizacion(this.usuarioActual.organizacionCamelCase);
            select.innerHTML = '<option value="">-- Seleccione una región --</option>';
            if (regiones.length === 0) {
                select.innerHTML = '<option value="">-- No hay regiones --</option>';
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
            if (select) select.innerHTML = '<option value="">-- Error cargando regiones --</option>';
        }
    }

    _cargarEstados() {
        const select = document.getElementById('estadoSucursal');
        if (!select) return;
        select.innerHTML = '<option value="">-- Seleccione un estado --</option>';
        ESTADOS_MEXICO.forEach(estado => {
            const option = document.createElement('option');
            option.value = estado;
            option.textContent = estado;
            select.appendChild(option);
        });
    }

    _volverALista() {
        window.location.href = '../sucursales/sucursales.html';
    }

    _cancelarCreacion() {
        Swal.fire({
            title: '¿Cancelar?',
            text: 'Los cambios no guardados se perderán',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, cancelar',
            cancelButtonText: 'No, continuar',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        }).then((result) => {
            if (result.isConfirmed) this._volverALista();
        });
    }

    _escapeHTML(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    if (typeof Swal === 'undefined') {
        return;
    }
    window.crearSucursalDebug.controller = new CrearSucursalController();
});