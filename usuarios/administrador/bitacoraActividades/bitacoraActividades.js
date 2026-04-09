// bitacoraActividades.js - CON NAVEGACIÓN A INCIDENCIAS (SIN ICONOS DE ACTIVIDAD)

class BitacoraController {
    constructor() {
        this.historialManager = null;
        this.usuarioActual = null;
        this.actividades = [];
        this.fechaSeleccionada = new Date();
        this.flatpickrInstance = null;
        this.loadingOverlay = null;
        this.generadorPDF = null;

        this._init();
    }

    async _init() {
        try {
            this._cargarUsuario();

            if (!this.usuarioActual) {
                throw new Error('No se pudo cargar información del usuario');
            }

            await this._inicializarManager();
            await this._inicializarGeneradorPDF();
            this._inicializarCalendario();
            this._configurarEventos();
            await this._cargarActividades(this.fechaSeleccionada);

        } catch (error) {
            console.error('Error inicializando bitácora:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    async _inicializarManager() {
        try {
            const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
            this.historialManager = new HistorialUsuarioManager();
        } catch (error) {
            console.error('Error cargando HistorialUsuarioManager:', error);
            throw error;
        }
    }

    async _inicializarGeneradorPDF() {
        try {
            const { generadorBitacoraPDF } = await import('/components/generadorPDFBitacora.js');
            this.generadorPDF = generadorBitacoraPDF;

            this.generadorPDF.configurar({
                usuarioActual: this.usuarioActual,
                organizacionActual: {
                    nombre: this.usuarioActual.organizacion
                },
                organizacionNombre: this.usuarioActual.organizacion,
                authToken: localStorage.getItem('authToken')
            });
        } catch (error) {
            console.error('Error inicializando generador PDF:', error);
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
                    correo: adminData.correoElectronico || '',
                    organizacion: adminData.organizacion || 'Sin organización',
                    organizacionCamelCase: adminData.organizacionCamelCase ||
                        this._generarCamelCase(adminData.organizacion)
                };
                return;
            }

            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            if (userData && Object.keys(userData).length > 0) {
                this.usuarioActual = {
                    id: userData.uid || userData.id || `user_${Date.now()}`,
                    uid: userData.uid || userData.id,
                    nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                    correo: userData.correo || userData.email || '',
                    organizacion: userData.organizacion || userData.empresa || 'Sin organización',
                    organizacionCamelCase: userData.organizacionCamelCase ||
                        this._generarCamelCase(userData.organizacion || userData.empresa)
                };
                return;
            }

            console.warn('No se encontraron datos de usuario, usando valores por defecto');
            this.usuarioActual = {
                id: `usuario_${Date.now()}`,
                uid: `usuario_${Date.now()}`,
                nombreCompleto: 'Usuario de Prueba',
                correo: 'prueba@centinela.com',
                organizacion: 'Mi Organización',
                organizacionCamelCase: 'miOrganizacion'
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

    _inicializarCalendario() {
        const calendarioInput = document.getElementById('calendario');
        if (calendarioInput && typeof flatpickr !== 'undefined') {
            try {
                this.flatpickrInstance = flatpickr(calendarioInput, {
                    dateFormat: "Y-m-d",
                    locale: "es",
                    defaultDate: this.fechaSeleccionada,
                    maxDate: new Date(),
                    disableMobile: true,
                    onChange: (selectedDates) => {
                        if (selectedDates.length > 0) {
                            this.fechaSeleccionada = selectedDates[0];
                            this._actualizarFechaTexto();
                            this._cargarActividades(this.fechaSeleccionada);
                        }
                    }
                });
            } catch (error) {
                console.error('Error inicializando Flatpickr:', error);
                calendarioInput.type = 'date';
                calendarioInput.max = this._formatearFechaInput(new Date());
            }
        }

        this._actualizarFechaTexto();
    }

    _formatearFechaInput(fecha) {
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    _formatearFechaLegible(fecha) {
        return fecha.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    _actualizarFechaTexto() {
        const spanFecha = document.getElementById('fechaSeleccionada');
        if (spanFecha) {
            const hoy = new Date();
            const esHoy = this.fechaSeleccionada.toDateString() === hoy.toDateString();
            spanFecha.textContent = esHoy ? 'Hoy' : this._formatearFechaLegible(this.fechaSeleccionada);
        }
    }

    async _cargarActividades(fecha) {
        try {
            this.actividades = await this.historialManager.obtenerActividadesPorUsuarioYFecha(
                this.usuarioActual.id,
                fecha,
                this.usuarioActual.organizacionCamelCase
            );

            this._renderizarActividades();
            this._actualizarContador();

        } catch (error) {
            console.error('Error cargando actividades:', error);
            this._mostrarError('No se pudieron cargar las actividades');
        }
    }

    _extraerIdIncidencia(actividad) {
        const detalles = actividad.detalles || {};
        
        if (actividad.modulo === 'incidencias') {
            return detalles.incidenciaId || detalles.id;
        }
        
        if (actividad.modulo === 'seguimiento') {
            return detalles.incidenciaId;
        }
        
        return null;
    }

    async _manejarClicActividad(actividadId) {
        const actividad = this.actividades.find(a => a.id === actividadId);
        if (!actividad) return;
        
        const incidenciaId = this._extraerIdIncidencia(actividad);
        
        if ((actividad.modulo === 'incidencias' || actividad.modulo === 'seguimiento') && incidenciaId) {
            const tipoTexto = actividad.modulo === 'incidencias' ? 'la incidencia' : 'el seguimiento de la incidencia';
            
            const result = await Swal.fire({
                title: '¿Ir a la incidencia?',
                html: `Deseas ver ${tipoTexto} <strong>${incidenciaId}</strong>?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#00cfff',
                cancelButtonColor: '#dc3545',
                confirmButtonText: 'Sí, ver incidencia',
                cancelButtonText: 'Cancelar',
                background: '#1a1a1a',
                color: '#fff'
            });
            
            if (result.isConfirmed) {
                window.location.href = `../verIncidencias/verIncidencias.html?id=${incidenciaId}`;
            }
        } else {
            if (actividad.modulo === 'incidencias' || actividad.modulo === 'seguimiento') {
                Swal.fire({
                    title: 'Información',
                    html: `Esta actividad registra una acción sobre <strong>${actividad.modulo}</strong>, pero no se encontró un ID de incidencia asociado.`,
                    icon: 'info',
                    confirmButtonColor: '#00cfff',
                    background: '#1a1a1a',
                    color: '#fff'
                });
            }
        }
    }

    _renderizarActividades() {
        const contenedor = document.getElementById('listaActividades');
        if (!contenedor) return;

        if (this.actividades.length === 0) {
            contenedor.innerHTML = `
                <div class="sin-actividades">
                    <i class="fas fa-calendar-day"></i>
                    <p>No hay actividades registradas para esta fecha</p>
                    <small>Selecciona otra fecha en el calendario</small>
                </div>
            `;
            return;
        }

        let html = '';
        this.actividades.forEach(act => {
            const uiData = act.toUI();
            const color = uiData.color;
            const incidenciaId = this._extraerIdIncidencia(act);
            const esNavegable = (act.modulo === 'incidencias' || act.modulo === 'seguimiento') && incidenciaId;
            
            const claseNavegable = esNavegable ? 'actividad-navegable' : '';
            
            html += `
                <div class="actividad-item ${claseNavegable}" data-actividad-id="${act.id}">
                    <!-- ELIMINADO EL ÍCONO DE ACTIVIDAD -->
                    <div class="actividad-contenido">
                        <div class="actividad-header">
                            <span class="actividad-hora" style="color: ${color};">
                                ${uiData.hora}
                            </span>
                            <span class="actividad-modulo">
                                ${uiData.modulo}
                            </span>
                            <span class="actividad-tipo" style="background: ${color}20; color: ${color};">
                                ${uiData.tipo}
                            </span>
                            ${esNavegable ? `
                                <span class="badge-navegable" style="background: ${color}20; color: ${color};">
                                    Ver incidencia
                                </span>
                            ` : ''}
                        </div>
                        <div class="actividad-descripcion">
                            ${uiData.descripcion}
                        </div>
                        <div class="actividad-usuario">
                            <div class="usuario-info">
                                <span class="usuario-nombre">${this._escapeHTML(uiData.usuario.nombre)}</span>
                                <span class="usuario-correo">(${this._escapeHTML(uiData.usuario.correo)})</span>
                            </div>
                        </div>
                        ${incidenciaId ? `
                            <div class="actividad-incidencia-id" style="margin-top: 8px; font-size: 12px; color: var(--color-accent-primary);">
                                ID: ${this._escapeHTML(incidenciaId)}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        contenedor.innerHTML = html;
        
        const itemsNavegables = contenedor.querySelectorAll('.actividad-item[data-actividad-id]');
        itemsNavegables.forEach(item => {
            const actividadId = item.getAttribute('data-actividad-id');
            item.addEventListener('click', (e) => {
                if (e.target.closest('.btn') || e.target.closest('button')) return;
                this._manejarClicActividad(actividadId);
            });
            
            if (item.classList.contains('actividad-navegable')) {
                item.style.cursor = 'pointer';
            }
        });
    }

    _getIconoModulo(modulo) {
        const iconos = {
            areas: 'fa-sitemap',
            categorias: 'fa-tags',
            sucursales: 'fa-store',
            regiones: 'fa-map-marked-alt',
            incidencias: 'fa-exclamation-triangle',
            seguimiento: 'fa-clipboard-list',
            mercanciasPerdidas: 'fa-box-open',
            permisos: 'fa-lock',
            usuarios: 'fa-users',
            tema: 'fa-paint-roller',
            login: 'fa-sign-in-alt',
            logout: 'fa-sign-out-alt'
        };
        return iconos[modulo] || 'fa-circle';
    }

    _actualizarContador() {
        const spanTotal = document.getElementById('totalActividades');
        if (spanTotal) {
            const total = this.actividades.length;
            spanTotal.textContent = `${total} ${total === 1 ? 'actividad' : 'actividades'}`;
        }
    }
async generarPDF() {
    if (!this.actividades || this.actividades.length === 0) {
        this._mostrarError('No hay actividades para generar el PDF');
        return;
    }

    if (!this.generadorPDF) {
        this._mostrarError('El generador de PDF no está disponible');
        return;
    }

    try {
        // Mostrar loading
        Swal.fire({
            title: 'Generando PDF...',
            text: 'Por favor espera',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        // Generar el PDF y obtener el blob/URL
        const pdfBlob = await this.generadorPDF.generarBitacoraPDFBlob(
            this.actividades,
            this.fechaSeleccionada,
            { mostrarAlerta: false }
        );

        Swal.close();

        // Crear URL del blob y abrir en nueva pestaña con visor nativo
        if (pdfBlob) {
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
            
            // Limpiar la URL después de un tiempo para liberar memoria
            setTimeout(() => {
                URL.revokeObjectURL(pdfUrl);
            }, 10000);
            
            // Notificación de éxito
            Swal.fire({
                icon: 'success',
                title: 'PDF generado',
                text: 'El PDF se abrirá en el visor del navegador',
                timer: 2000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end',
                background: '#1a1a1a',
                color: '#fff'
            });
        } else {
            throw new Error('No se pudo generar el PDF');
        }
        
    } catch (error) {
        Swal.close();
        console.error('Error generando PDF:', error);
        this._mostrarError('Error al generar el PDF: ' + error.message);
    }
}
    _configurarEventos() {
        try {
            document.getElementById('btnVolverDashboard')?.addEventListener('click', () => {
                window.location.href = '../panelControl/panelControl.html';
            });

            document.getElementById('btnRefrescar')?.addEventListener('click', () => {
                this._cargarActividades(this.fechaSeleccionada);
            });

            document.getElementById('btnHoy')?.addEventListener('click', () => {
                this.fechaSeleccionada = new Date();
                if (this.flatpickrInstance) {
                    this.flatpickrInstance.setDate(this.fechaSeleccionada);
                } else {
                    const calendarioInput = document.getElementById('calendario');
                    if (calendarioInput) {
                        calendarioInput.value = this._formatearFechaInput(this.fechaSeleccionada);
                    }
                }
                this._actualizarFechaTexto();
                this._cargarActividades(this.fechaSeleccionada);
            });

            const btnPDF = document.getElementById('btnGenerarPDF');
            if (btnPDF) {
                btnPDF.addEventListener('click', () => this.generarPDF());
            }

        } catch (error) {
            console.error('Error configurando eventos:', error);
        }
    }

    _mostrarError(mensaje) {
        this._mostrarNotificacion(mensaje, 'error');
    }

    _mostrarNotificacion(mensaje, tipo = 'info', duracion = 5000) {
        const config = {
            title: tipo === 'success' ? 'Éxito' :
                tipo === 'error' ? 'Error' :
                    tipo === 'warning' ? 'Advertencia' : 'Información',
            text: mensaje,
            icon: tipo,
            timer: duracion,
            timerProgressBar: true,
            showConfirmButton: false,
            background: '#1a1a1a',
            color: '#fff'
        };

        if (tipo === 'error') {
            config.showConfirmButton = true;
            config.confirmButtonColor = '#00cfff';
            config.timer = undefined;
        }

        Swal.fire(config);
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
}

document.addEventListener('DOMContentLoaded', () => {
    window.bitacoraDebug = { controller: new BitacoraController() };
});