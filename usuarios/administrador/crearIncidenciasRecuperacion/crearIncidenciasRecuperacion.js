// crearIncidenciasRecuperacion.js - CONTROLADOR COMPLETO
// VERSIÓN OPTIMIZADA CON VISTA PREVIA DE PDF QUE SE SUBA DIRECTAMENTE
// SIN DEPENDENCIA DE manejadorPDFSegundoPlano.js

const LIMITES = {
    NARRACION_EVENTOS: 2000,
    DETALLES_PERDIDA: 1000
};

class CrearMercanciaPerdidaController {
    constructor() {
        this.mercanciaManager = null;
        this.usuarioActual = null;
        this.empresas = [];
        this.sucursalesLista = []; // 👈 NUEVO: lista completa de sucursales
        this.sucursalSeleccionada = null; // 👈 NUEVO: sucursal seleccionada
        this.imagenesSeleccionadas = [];
        this.imageEditorModal = null;
        this.loadingOverlay = null;
        this.flatpickrInstance = null;
        this.historialManager = null;

        this.pdfGenerator = null;
        this.isInitialized = false;

        // Para vista previa de PDF
        this.pdfBlobGenerado = null;
        this.datosActuales = null;

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

    async _initPDFGenerator() {
        if (!this.pdfGenerator) {
            try {
                const { generadorMercanciaPDF } = await import('/components/mercanciaPDF.js');
                this.pdfGenerator = generadorMercanciaPDF;
                console.log('✅ PDFGenerator inicializado correctamente');
                return true;
            } catch (error) {
                console.error('Error inicializando PDFGenerator:', error);
                return false;
            }
        }
        return true;
    }

    // =============================================
    // ABRIR PDF EN NUEVA PESTAÑA
    // =============================================
    async _abrirPDFEnNuevaPestana(datos) {
        try {
            Swal.fire({
                title: 'Generando PDF...',
                text: 'Preparando el reporte, esto puede tomar unos segundos',
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            this.datosActuales = datos;

            const registroTemporal = this._crearRegistroTemporal(datos);

            console.log('📄 Generando PDF para nueva pestaña...');
            console.log('📸 Evidencias:', registroTemporal.evidencias?.length || 0);
            console.log('📍 Sucursal seleccionada:', this.sucursalSeleccionada);

            const pdfBlob = await this.pdfGenerator.generarReporte(registroTemporal, {
                mostrarAlerta: false,
                returnBlob: true,
                diagnosticar: false
            });

            if (!pdfBlob || pdfBlob.size === 0) {
                throw new Error('El PDF generado está vacío');
            }

            console.log(`📦 PDF generado: ${(pdfBlob.size / 1024).toFixed(2)} KB`);

            this.pdfBlobGenerado = pdfBlob;

            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');

            setTimeout(() => {
                URL.revokeObjectURL(pdfUrl);
            }, 10000);

            Swal.close();

            console.log('✅ PDF abierto en nueva pestaña');

        } catch (error) {
            console.error('❌ Error generando PDF:', error);
            Swal.close();

            Swal.fire({
                icon: 'error',
                title: 'Error al generar PDF',
                text: error.message || 'No se pudo generar el reporte',
                footer: 'Por favor, verifica tu conexión y las imágenes seleccionadas.'
            });
        }
    }

    // =============================================
    // CREAR REGISTRO TEMPORAL CON SUCURSAL COMPLETA
    // =============================================
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

        // 👈 USAR LA SUCURSAL COMPLETA QUE SE SELECCIONÓ
        return {
            id: `Vista Previa`,
            nombreEmpresaCC: datos.nombreEmpresaCC,
            tipoEvento: datos.tipoEvento,
            montoPerdido: datos.montoPerdido,
            montoRecuperado: datos.montoRecuperado,
            fecha: fechaObj,
            hora: fechaObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
            narracionEventos: datos.narracionEventos,
            detallesPerdida: datos.detallesPerdida,
            reportadoPorNombre: this.usuarioActual.nombreCompleto,
            evidencias: evidenciasProcesadas,
            estado: 'activo',
            sucursalInfo: this.sucursalSeleccionada,  // 👈 Sucursal completa (ciudad, estado, dirección)
            getMontoNeto: () => datos.montoPerdido - (datos.montoRecuperado || 0),
            getPorcentajeRecuperado: () => datos.montoPerdido > 0 ? ((datos.montoRecuperado || 0) / datos.montoPerdido) * 100 : 0,
            getEstadoTexto: () => 'Activo',
            getTipoEventoTexto: () => this._getTipoEventoTexto(datos.tipoEvento)
        };
    }

    // =============================================
    // MÉTODOS EXISTENTES
    // =============================================

    async _init() {
        try {
            this._cargarUsuario();

            if (!this.usuarioActual) {
                throw new Error('No se pudo cargar información del usuario');
            }

            console.log('👤 Usuario cargado:', this.usuarioActual);

            await this._inicializarManager();
            await this._cargarEmpresas();

            const pdfOk = await this._initPDFGenerator();

            if (!pdfOk) {
                console.warn('⚠️ PDFGenerator no disponible');
            }

            this._configurarOrganizacion();
            this._inicializarDateTimePicker();
            this._configurarEventos();
            this._inicializarValidaciones();
            this._configurarMontoPreview();

            this.imageEditorModal = new window.ImageEditorModal();

            this.isInitialized = true;

        } catch (error) {
            console.error('Error inicializando:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    async _inicializarManager() {
        try {
            const { MercanciaPerdidaManager } = await import('/clases/mercanciaPerdida.js');
            this.mercanciaManager = new MercanciaPerdidaManager();
        } catch (error) {
            console.error('Error cargando MercanciaPerdidaManager:', error);
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
        const fechaInput = document.getElementById('fechaHoraEvento');
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
                fechaInput.max = this._formatearFechaParaInput(new Date());
            }
        } else {
            console.warn('Flatpickr no está disponible, usando input nativo');
            const fechaInput = document.getElementById('fechaHoraEvento');
            if (fechaInput) {
                fechaInput.type = 'datetime-local';
                fechaInput.max = this._formatearFechaParaInput(new Date());
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

    // =============================================
    // CARGAR SUCURSALES (GUARDAR LISTA COMPLETA)
    // =============================================
    async _cargarEmpresas() {
        try {
            const { SucursalManager } = await import('/clases/sucursal.js');
            const sucursalManager = new SucursalManager();

            const sucursales = await sucursalManager.getSucursalesByOrganizacion(
                this.usuarioActual.organizacionCamelCase
            );

            // 👈 GUARDAR LISTA COMPLETA DE SUCURSALES
            this.sucursalesLista = sucursales;
            this.empresas = sucursales.map(s => s.nombre);
            this.empresas = [...new Set(this.empresas)];

            console.log('✅ Sucursales cargadas:', this.sucursalesLista.length);

        } catch (error) {
            console.error('Error cargando empresas:', error);
            this.empresas = [];
            this.sucursalesLista = [];
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
        const narracionInput = document.getElementById('narracionEventos');
        if (narracionInput) {
            narracionInput.maxLength = LIMITES.NARRACION_EVENTOS;
            narracionInput.addEventListener('input', () => {
                this._validarLongitudCampo(narracionInput, LIMITES.NARRACION_EVENTOS, 'La narración');
                this._actualizarContador('narracionEventos', 'contadorNarracion', LIMITES.NARRACION_EVENTOS);
            });
        }

        const detallesInput = document.getElementById('detallesPerdida');
        if (detallesInput) {
            detallesInput.maxLength = LIMITES.DETALLES_PERDIDA;
            detallesInput.addEventListener('input', () => {
                this._validarLongitudCampo(detallesInput, LIMITES.DETALLES_PERDIDA, 'Los detalles');
                this._actualizarContador('detallesPerdida', 'contadorDetalles', LIMITES.DETALLES_PERDIDA);
            });
        }

        this._actualizarContador('narracionEventos', 'contadorNarracion', LIMITES.NARRACION_EVENTOS);
        this._actualizarContador('detallesPerdida', 'contadorDetalles', LIMITES.DETALLES_PERDIDA);
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

    _configurarMontoPreview() {
        const montoPerdido = document.getElementById('montoPerdido');
        const montoRecuperado = document.getElementById('montoRecuperado');
        const perdidoPreview = document.getElementById('montoPerdidoPreview');
        const recuperadoPreview = document.getElementById('montoRecuperadoPreview');

        if (montoPerdido && perdidoPreview) {
            montoPerdido.addEventListener('input', () => {
                const valor = parseFloat(montoPerdido.value) || 0;
                perdidoPreview.textContent = `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            });
        }

        if (montoRecuperado && recuperadoPreview) {
            montoRecuperado.addEventListener('input', () => {
                const valor = parseFloat(montoRecuperado.value) || 0;
                recuperadoPreview.textContent = `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            });
        }
    }

    _configurarEventos() {
        try {
            document.getElementById('btnVolverLista')?.addEventListener('click', () => this._volverALista());
            document.getElementById('btnCancelar')?.addEventListener('click', () => this._cancelarCreacion());

            document.getElementById('btnCrearRegistro')?.addEventListener('click', (e) => {
                e.preventDefault();
                this._validarYMostrarOpciones();
            });

            document.getElementById('btnAgregarImagen')?.addEventListener('click', () => {
                document.getElementById('inputImagenes').click();
            });

            document.getElementById('inputImagenes')?.addEventListener('change', (e) => this._procesarImagenes(e.target.files));

            document.getElementById('formMercanciaPrincipal')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this._validarYMostrarOpciones();
            });

            this._configurarSugerencias();

            this._configurarValidacionSecuencial();

        } catch (error) {
            console.error('Error configurando eventos:', error);
        }
    }

    _configurarValidacionSecuencial() {
        const ordenCampos = [
            { id: 'nombreEmpresaCC', siguiente: 'tipoEvento', validar: (valor) => valor.trim() !== '' },
            { id: 'tipoEvento', siguiente: 'montoPerdido', validar: (valor) => valor !== '' },
            {
                id: 'montoPerdido', siguiente: 'montoRecuperado', validar: (valor) => {
                    const monto = parseFloat(valor);
                    return !isNaN(monto) && monto > 0;
                }
            },
            { id: 'montoRecuperado', siguiente: 'fechaHoraEvento', validar: (valor) => true },
            { id: 'fechaHoraEvento', siguiente: 'narracionEventos', validar: (valor) => valor.trim() !== '' },
            {
                id: 'narracionEventos', siguiente: 'detallesPerdida', validar: (valor) => {
                    const texto = valor.trim();
                    return texto.length >= 10 && texto.length <= LIMITES.NARRACION_EVENTOS;
                }
            },
            { id: 'detallesPerdida', siguiente: null, validar: (valor) => true }
        ];

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

            const eventoCambio = campo.id === 'montoPerdido' || campo.id === 'montoRecuperado' ? 'input' : 'change';
            elemento.addEventListener(eventoCambio, () => {
                this._validarYHabilitarSiguiente(campo.id);
            });

            if (elemento.tagName === 'INPUT' && elemento.type === 'text') {
                elemento.addEventListener('blur', () => {
                    this._validarYHabilitarSiguiente(campo.id);
                });
            }
        });

        const montoRecuperado = document.getElementById('montoRecuperado');
        if (montoRecuperado) {
            montoRecuperado.addEventListener('input', () => {
                this._validarYHabilitarSiguiente('montoRecuperado');
            });
        }

        const fechaInput = document.getElementById('fechaHoraEvento');
        if (fechaInput) {
            fechaInput.addEventListener('change', () => {
                this._validarYHabilitarSiguiente('fechaHoraEvento');
            });
        }

        const narracion = document.getElementById('narracionEventos');
        if (narracion) {
            narracion.addEventListener('input', () => {
                this._validarYHabilitarSiguiente('narracionEventos');
            });
        }
    }

    _habilitarCampo(elemento) {
        if (!elemento) return;
        elemento.disabled = false;
        elemento.classList.remove('locked');

        if (elemento.tagName === 'SELECT') {
            elemento.disabled = false;
        }

        if (elemento.tagName === 'INPUT') {
            elemento.readOnly = false;
        }

        if (elemento.tagName === 'TEXTAREA') {
            elemento.readOnly = false;
        }

        const parent = elemento.closest('.form-field, .full-width, .input-group');
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

        const parent = elemento.closest('.form-field, .full-width, .input-group');
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

        if (campo.tagName === 'SELECT') {
            valor = campo.value;
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
            }
        }

        if (!esValido && config.siguienteId) {
            this._deshabilitarCamposSiguientes(config.siguienteId);
        }
    }

    _deshabilitarCamposSiguientes(campoId) {
        const ordenCampos = [
            'nombreEmpresaCC',
            'tipoEvento',
            'montoPerdido',
            'montoRecuperado',
            'fechaHoraEvento',
            'narracionEventos',
            'detallesPerdida'
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

    // =============================================
    // CONFIGURAR SUGERENCIAS CON SUCURSAL COMPLETA
    // =============================================
    _configurarSugerencias() {
        const inputEmpresa = document.getElementById('nombreEmpresaCC');

        if (inputEmpresa) {
            inputEmpresa.addEventListener('input', (e) => {
                this._mostrarSugerenciasEmpresa(e.target.value);
            });

            inputEmpresa.addEventListener('blur', () => {
                setTimeout(() => {
                    document.getElementById('sugerenciasEmpresa').innerHTML = '';
                }, 200);
            });

            inputEmpresa.addEventListener('focus', (e) => {
                if (e.target.value.length > 0) {
                    this._mostrarSugerenciasEmpresa(e.target.value);
                }
            });
        }
    }

    _mostrarSugerenciasEmpresa(termino) {
        const contenedor = document.getElementById('sugerenciasEmpresa');
        if (!contenedor) return;

        const terminoLower = termino.toLowerCase().trim();

        if (terminoLower.length === 0) {
            contenedor.innerHTML = '';
            return;
        }

        const sugerencias = this.empresas.filter(emp =>
            emp.toLowerCase().includes(terminoLower)
        ).slice(0, 8);

        if (sugerencias.length === 0) {
            contenedor.innerHTML = `
                <div class="sugerencias-lista">
                    <div class="sugerencia-vacia">
                        <i class="fas fa-store"></i>
                        <p>No se encontraron empresas</p>
                        <small>Puedes escribir el nombre manualmente</small>
                    </div>
                </div>
            `;
            return;
        }

        let html = '<div class="sugerencias-lista">';
        sugerencias.forEach(emp => {
            const seleccionada = document.getElementById('nombreEmpresaCC').value === emp;
            html += `
                <div class="sugerencia-item ${seleccionada ? 'seleccionada' : ''}" 
                     data-nombre="${this._escapeHTML(emp)}">
                    <div class="sugerencia-icono">
                        <i class="fas fa-building"></i>
                    </div>
                    <div class="sugerencia-info">
                        <div class="sugerencia-nombre">${this._escapeHTML(emp)}</div>
                        <div class="sugerencia-detalle">
                            <i class="fas fa-check-circle"></i>
                            Seleccionar
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        contenedor.innerHTML = html;

        contenedor.querySelectorAll('.sugerencia-item').forEach(item => {
            item.addEventListener('click', () => {
                const nombre = item.dataset.nombre;
                this._seleccionarEmpresa(nombre);
            });
        });
    }

    // =============================================
    // SELECCIONAR EMPRESA (GUARDAR SUCURSAL COMPLETA)
    // =============================================
    _seleccionarEmpresa(nombre) {
        const input = document.getElementById('nombreEmpresaCC');
        input.value = nombre;
        input.dataset.selectedName = nombre;

        // 👈 BUSCAR LA SUCURSAL COMPLETA EN LA LISTA
        const sucursalEncontrada = this.sucursalesLista?.find(s => s.nombre === nombre);

        if (sucursalEncontrada) {
            // Guardar toda la información de la sucursal
            this.sucursalSeleccionada = sucursalEncontrada;
            console.log('📍 Sucursal seleccionada:', sucursalEncontrada.nombre);
            console.log('   Ciudad:', sucursalEncontrada.ciudad);
            console.log('   Estado:', sucursalEncontrada.estado);
            console.log('   Dirección:', sucursalEncontrada.direccion);
        } else {
            this.sucursalSeleccionada = null;
            console.warn('⚠️ No se encontró la sucursal en la lista:', nombre);
        }

        document.getElementById('sugerenciasEmpresa').innerHTML = '';
        input.dispatchEvent(new Event('change'));
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
                this._mostrarNotificacion(`La imagen ${file.name} excede 10MB`, 'warning');
                return false;
            }

            const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
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
                    <p>No hay evidencias seleccionadas</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.imagenesSeleccionadas.forEach((img, index) => {
            html += `
                <div class="preview-item">
                    <img src="${img.preview}" alt="Evidencia ${index + 1}">
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

    // =============================================
    // VALIDAR Y MOSTRAR OPCIONES
    // =============================================
    async _validarYMostrarOpciones() {
        const empresaInput = document.getElementById('nombreEmpresaCC');
        const nombreEmpresaCC = empresaInput.value.trim();

        if (!nombreEmpresaCC) {
            this._mostrarError('Debe ingresar el nombre de la empresa o centro comercial');
            empresaInput.focus();
            return;
        }

        const tipoEvento = document.getElementById('tipoEvento').value;
        if (!tipoEvento) {
            this._mostrarError('Debe seleccionar el tipo de evento');
            document.getElementById('tipoEvento').focus();
            return;
        }

        const montoPerdido = parseFloat(document.getElementById('montoPerdido').value) || 0;
        if (montoPerdido <= 0) {
            this._mostrarError('Debe ingresar un monto perdido válido mayor a 0');
            document.getElementById('montoPerdido').focus();
            return;
        }

        const montoRecuperado = parseFloat(document.getElementById('montoRecuperado').value) || 0;

        const fechaInput = document.getElementById('fechaHoraEvento');
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

        const narracionInput = document.getElementById('narracionEventos');
        const narracionEventos = narracionInput.value.trim();
        if (!narracionEventos) {
            narracionInput.classList.add('is-invalid');
            this._mostrarError('La narración de los eventos es obligatoria');
            narracionInput.focus();
            return;
        }
        if (narracionEventos.length < 10) {
            narracionInput.classList.add('is-invalid');
            this._mostrarError('La narración debe tener al menos 10 caracteres');
            narracionInput.focus();
            return;
        }
        if (narracionEventos.length > LIMITES.NARRACION_EVENTOS) {
            narracionInput.classList.add('is-invalid');
            this._mostrarError(`La narración no puede exceder ${LIMITES.NARRACION_EVENTOS} caracteres`);
            narracionInput.focus();
            return;
        }
        narracionInput.classList.remove('is-invalid');

        const detallesPerdida = document.getElementById('detallesPerdida').value.trim();

        const datos = {
            nombreEmpresaCC,
            tipoEvento,
            montoPerdido,
            montoRecuperado,
            fechaHora,
            narracionEventos,
            detallesPerdida,
            imagenes: this.imagenesSeleccionadas
        };

        const result = await Swal.fire({
            title: 'Confirmar registro',
            html: `
                <div style="text-align: left;">
                    <p><strong><i class="fas fa-store"></i> Empresa:</strong> ${this._escapeHTML(nombreEmpresaCC)}</p>
                    <p><strong><i class="fas fa-exclamation-triangle"></i> Tipo:</strong> ${this._getTipoEventoTexto(tipoEvento)}</p>
                    <p><strong><i class="fas fa-dollar-sign"></i> Monto:</strong> $${montoPerdido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                    <p><strong><i class="fas fa-images"></i> Evidencias:</strong> ${this.imagenesSeleccionadas.length} imagen(es)</p>
                </div>
                <hr>
                <p style="font-size: 12px; color: #aaa;">Selecciona una opción:</p>
            `,
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: '<i class="fas fa-check-circle"></i> Aceptar',
            denyButtonText: '<i class="fas fa-file-pdf"></i> Ver PDF',
            cancelButtonText: '<i class="fas fa-times"></i> Cerrar',
            confirmButtonColor: '#28a745',
            denyButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            reverseButtons: false
        });

        if (result.isConfirmed) {
            await this._guardarRegistroDirecto(datos);
        } else if (result.isDenied) {
            await this._abrirPDFEnNuevaPestana(datos);
        }
    }

    // =============================================
    // GUARDAR REGISTRO CON SUCURSAL COMPLETA
    // =============================================
    async _guardarRegistroDirecto(datos) {
        const btnCrear = document.getElementById('btnCrearRegistro');
        const originalHTML = btnCrear ? btnCrear.innerHTML : '<i class="fas fa-check me-2"></i>Registrar Evento';

        let registroId = null;

        try {
            if (btnCrear) {
                btnCrear.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Guardando...';
                btnCrear.disabled = true;
            }

            Swal.fire({
                title: 'Guardando registro...',
                text: 'Generando reporte y subiendo evidencias...',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const fechaObj = new Date(datos.fechaHora);
            const hora = fechaObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

            const registroTemporal = this._crearRegistroTemporal(datos);
            const pdfBlob = await this.pdfGenerator.generarReporte(registroTemporal, {
                mostrarAlerta: false,
                returnBlob: true,
                diagnosticar: false
            });

            if (!pdfBlob || pdfBlob.size === 0) {
                throw new Error('No se pudo generar el PDF');
            }

            // 👈 GUARDAR SUCURSAL COMPLETA EN FIRESTORE
            const registroData = {
                nombreEmpresaCC: datos.nombreEmpresaCC,
                tipoEvento: datos.tipoEvento,
                montoPerdido: datos.montoPerdido,
                montoRecuperado: datos.montoRecuperado,
                fecha: fechaObj,
                hora: hora,
                narracionEventos: datos.narracionEventos,
                detallesPerdida: datos.detallesPerdida,
                reportadoPorId: this.usuarioActual.id,
                reportadoPorNombre: this.usuarioActual.nombreCompleto,
                sucursalInfo: this.sucursalSeleccionada  // 👈 Sucursal completa
            };

            const nuevoRegistro = await this.mercanciaManager.crearRegistro(
                registroData,
                this.usuarioActual,
                [],
                []
            );

            registroId = nuevoRegistro.id;
            console.log('✅ Registro creado:', registroId);

            Swal.update({
                title: 'Subiendo evidencias...',
                text: `Subiendo ${datos.imagenes.length} evidencias...`
            });

            const evidenciasUrls = await this._subirEvidencias(registroId, datos.imagenes);

            if (evidenciasUrls.length > 0) {
                await this.mercanciaManager.actualizarRegistro(
                    registroId,
                    { evidencias: evidenciasUrls },
                    this.usuarioActual.id,
                    this.usuarioActual.organizacionCamelCase,
                    this.usuarioActual
                );
                console.log(`✅ ${evidenciasUrls.length} evidencias actualizadas`);
            }

            Swal.update({
                title: 'Subiendo PDF...',
                text: 'Guardando el reporte PDF...'
            });

            const pdfFile = new File([pdfBlob], `reporte_${registroId}.pdf`, { type: 'application/pdf' });
            const rutaPDF = `mercancia_perdida_${this.usuarioActual.organizacionCamelCase}/${registroId}/pdf/reporte_${registroId}.pdf`;

            const resultado = await this.mercanciaManager.subirArchivo(pdfFile, rutaPDF);

            await this.mercanciaManager.actualizarEstadoPDF(
                registroId,
                'completado',
                resultado.url,
                this.usuarioActual.organizacionCamelCase,
                this.usuarioActual
            );

            console.log('✅ PDF subido exitosamente:', resultado.url);

            Swal.close();

            const historial = await this._initHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: this.usuarioActual,
                    tipo: 'crear',
                    modulo: 'mercancia_perdida',
                    descripcion: `Registró mercancía perdida - ${datos.nombreEmpresaCC}`,
                    detalles: {
                        registroId,
                        nombreEmpresaCC: datos.nombreEmpresaCC,
                        montoPerdido: datos.montoPerdido,
                        tipoEvento: datos.tipoEvento,
                        totalEvidencias: evidenciasUrls.length
                    }
                });
            }

            await Swal.fire({
                icon: 'success',
                title: '¡Incidencia creada!',
                text: 'Se creó correctamente la incidencia',
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#28a745'
            });

            this._volverALista();

        } catch (error) {
            console.error('Error guardando registro:', error);
            Swal.close();

            if (registroId) {
                try {
                    const rutaStorage = `mercancia_perdida_${this.usuarioActual.organizacionCamelCase}/${registroId}`;
                    await this.mercanciaManager.eliminarCarpetaStorage(rutaStorage);
                    await this.mercanciaManager.eliminarRegistro(registroId, this.usuarioActual.organizacionCamelCase, false);
                } catch (cleanupError) {
                    console.error('Error limpiando:', cleanupError);
                }
            }

            this._mostrarError(error.message || 'No se pudo registrar el evento');
        } finally {
            if (btnCrear) {
                btnCrear.innerHTML = originalHTML;
                btnCrear.disabled = false;
            }
        }
    }

    async _subirEvidencias(registroId, imagenes) {
        if (!imagenes || imagenes.length === 0) return [];

        const resultados = [];
        console.log(`📤 Subiendo ${imagenes.length} evidencias...`);

        for (let i = 0; i < imagenes.length; i++) {
            const img = imagenes[i];
            const comentario = img.comentario || '';

            const nombreArchivo = img.generatedName ||
                `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${img.file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

            const rutaStorage = `mercancia_perdida_${this.usuarioActual.organizacionCamelCase}/${registroId}/evidencias/${nombreArchivo}`;

            try {
                console.log(`📤 Evidencia ${i + 1}/${imagenes.length}: ${nombreArchivo}`);
                const resultado = await this.mercanciaManager.subirArchivo(img.file, rutaStorage);

                resultados.push({
                    id: `EVD${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
                    url: resultado.url,
                    path: resultado.path,
                    comentario: comentario,
                    nombre: img.file.name,
                    generatedName: nombreArchivo,
                    fechaAgregada: new Date()
                });
                console.log(`✅ Evidencia ${i + 1} subida correctamente`);
            } catch (error) {
                console.error(`❌ Error subiendo evidencia ${i + 1}:`, error);
                throw error;
            }
        }

        return resultados;
    }

    _volverALista() {
        this.imagenesSeleccionadas.forEach(img => {
            if (img.preview) {
                URL.revokeObjectURL(img.preview);
            }
        });
        window.location.href = '../mercanciaPerdida/mercanciaPerdida.html';
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

    _getTipoEventoTexto(tipo) {
        const tipos = {
            'robo': 'Robo',
            'extravio': 'Extravío',
            'accidente': 'Accidente',
            'otro': 'Otro'
        };
        return tipos[tipo] || tipo;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.crearMercanciaPerdidaDebug = { controller: new CrearMercanciaPerdidaController() };
});


// =============================================
// FORMULARIO SECUENCIAL - APARECEN AL LLENAR
// =============================================

document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        inicializarFormularioSecuencial();
    }, 500);
});

function inicializarFormularioSecuencial() {
    let pasoActual = 0;
    const totalPasos = 7;
    const campos = document.querySelectorAll('.field-group-step');

    // Ocultar todos los campos
    campos.forEach(campo => {
        campo.classList.remove('visible');
    });

    // Mostrar solo el primer campo
    if (campos[0]) {
        campos[0].classList.add('visible');
    }

    // Verificar si todos los campos requeridos están completos para mostrar los botones
    function verificarBotonesFinales() {
        const empresaValida = document.getElementById('nombreEmpresaCC').value.trim() !== '';
        const tipoValido = document.getElementById('tipoEvento').value !== '';
        const montoValido = parseFloat(document.getElementById('montoPerdido').value) > 0;
        const fechaValida = (() => {
            const fechaValor = document.getElementById('fechaHoraEvento').value;
            if (!fechaValor) return false;
            const fecha = new Date(fechaValor);
            return !isNaN(fecha.getTime()) && fecha <= new Date();
        })();
        const narracionValida = (() => {
            const texto = document.getElementById('narracionEventos').value.trim();
            return texto.length >= 10 && texto.length <= 2000;
        })();

        if (empresaValida && tipoValido && montoValido && fechaValida && narracionValida) {
            document.getElementById('originalButtons').style.display = 'flex';
        } else {
            document.getElementById('originalButtons').style.display = 'none';
        }
    }

    // Función para validar y mostrar siguiente campo
    function validarYMostrarSiguiente(stepIndex) {
        if (stepIndex !== pasoActual) return;

        let esValido = false;

        switch (stepIndex) {
            case 0: // Empresa
                esValido = document.getElementById('nombreEmpresaCC').value.trim() !== '';
                break;
            case 1: // Tipo evento
                esValido = document.getElementById('tipoEvento').value !== '';
                break;
            case 2: // Monto perdido
                const monto = parseFloat(document.getElementById('montoPerdido').value);
                esValido = !isNaN(monto) && monto > 0;
                break;
            case 3: // Monto recuperado (opcional)
                esValido = true;
                break;
            case 4: // Fecha
                const fechaValor = document.getElementById('fechaHoraEvento').value;
                if (!fechaValor) {
                    esValido = false;
                } else {
                    const fecha = new Date(fechaValor);
                    esValido = !isNaN(fecha.getTime()) && fecha <= new Date();
                }
                break;
            case 5: // Narración
                const texto = document.getElementById('narracionEventos').value.trim();
                esValido = texto.length >= 10 && texto.length <= 2000;
                break;
            case 6: // Detalles (opcional)
                esValido = true;
                break;
        }

        if (esValido && pasoActual < totalPasos - 1) {
            // Mostrar el siguiente campo
            const siguienteIndex = pasoActual + 1;
            const siguienteCampo = document.querySelector(`.field-group-step[data-step="${siguienteIndex}"]`);
            if (siguienteCampo) {
                siguienteCampo.classList.add('visible');
                pasoActual = siguienteIndex;

                // Enfocar el nuevo campo
                setTimeout(() => {
                    const nuevoInput = siguienteCampo.querySelector('input, select, textarea');
                    if (nuevoInput) nuevoInput.focus();
                }, 100);
            }
        }

        verificarBotonesFinales();
    }

    // Configurar eventos para cada campo
    function configurarEventos() {
        const empresaInput = document.getElementById('nombreEmpresaCC');
        if (empresaInput) {
            empresaInput.addEventListener('change', () => validarYMostrarSiguiente(0));
            empresaInput.addEventListener('blur', () => validarYMostrarSiguiente(0));
        }

        const tipoSelect = document.getElementById('tipoEvento');
        if (tipoSelect) {
            tipoSelect.addEventListener('change', () => validarYMostrarSiguiente(1));
        }

        const montoInput = document.getElementById('montoPerdido');
        if (montoInput) {
            montoInput.addEventListener('input', () => validarYMostrarSiguiente(2));
        }

        const montoRecupInput = document.getElementById('montoRecuperado');
        if (montoRecupInput) {
            montoRecupInput.addEventListener('input', () => validarYMostrarSiguiente(3));
        }

        const fechaInput = document.getElementById('fechaHoraEvento');
        if (fechaInput) {
            fechaInput.addEventListener('change', () => validarYMostrarSiguiente(4));
        }

        const narracionTextarea = document.getElementById('narracionEventos');
        if (narracionTextarea) {
            narracionTextarea.addEventListener('input', () => validarYMostrarSiguiente(5));
        }

        const detallesTextarea = document.getElementById('detallesPerdida');
        if (detallesTextarea) {
            detallesTextarea.addEventListener('input', () => validarYMostrarSiguiente(6));
        }
    }

    configurarEventos();
    verificarBotonesFinales();
}