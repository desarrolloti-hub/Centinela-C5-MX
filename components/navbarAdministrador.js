// [file name]: navbarAdministrador.js
// [file path]: /components/navbarAdministrador.js

class NavbarComplete {
    constructor() {
        this.isMenuOpen = false;
        this.isAdminDropdownOpen = false;
        this.isAdministracionDropdownOpen = false;
        this.isIncidenciasDropdownOpen = false;
        this.isMonitoreoDropdownOpen = false;
        this.currentAdmin = null;
        this.userManager = null;
        this.notificacionManager = null;
        this.planManager = null;
        this.permisosPlan = null;
        this.notificacionesNoLeidas = 0;
        this.notificaciones = [];
        this.dropdownNotificacionesAbierto = false;
        this.intervalNotificaciones = null;

        // Sistema de sonidos
        this.sonidoNotificacion = null;
        this.soundEnabled = true;
        this.soundVolume = 0.7;
        this.availableSounds = [];

        // ===== ATENCIÓN DE EVENTOS (CRÍTICO) =====
        this.atencionEventosManager = null;
        this.esAreaSeguridad = true; // administrador siempre puede atender

        this._permisoNotificacionesPedido = false;

        this.init();
    }

    init() {
        if (window.NavbarCompleteLoaded) return;
        window.NavbarCompleteLoaded = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            setTimeout(() => this.setup(), 100);
        }
    }

    async setup() {
        try {
            this.removeOriginalNavbar();
            this.createNavbar();
            this.setupFunctionalities();

            this.loadAdminDataFromLocalStorage();
            this.updateNavbarWithAdminData();

            window.addEventListener("nuevaNotificacion", () => {
                this._cargarNotificaciones(true);
            });

            // Inicializar notificaciones
            this._initNotificacionManager().then(() => {
                this._cargarNotificaciones(false);
                this._iniciarListenerNotificaciones();
            });

            // Inicializar permisos del plan y sistema de sonido y atención de eventos EN PARALELO
            Promise.all([
                this.loadAdminDataFromFirebase(),
                this.cargarPermisosDelPlan(),
                this._initSonidoNotificacion(),
                this._initAtencionEventosManager(),
            ]).catch(() => { });

            this._solicitarPermisoNotificaciones();
            import("/components/escuchaEventos.js").catch(() => { });
        } catch (error) {
            // Error silencioso
        }
    }

    _solicitarPermisoNotificaciones() {
        if (this._permisoNotificacionesPedido) return;
        this._permisoNotificacionesPedido = true;
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    // ========== SONIDO ==========
    async _initSonidoNotificacion() {
        try {
            const { sonidoNotificacion } = await import('/clases/sonidoNotificacion.js');
            this.sonidoNotificacion = sonidoNotificacion;

            await this.sonidoNotificacion.initialize();
            this.availableSounds = this.sonidoNotificacion.getAvailableSounds();

            if (this.currentAdmin) {
                const deviceId = this._getDeviceId();
                const dispositivoActual = this.currentAdmin.dispositivos?.find(
                    d => d.deviceId === deviceId
                );

                if (dispositivoActual) {
                    if (dispositivoActual.soundEnabled !== undefined) {
                        this.soundEnabled = dispositivoActual.soundEnabled;
                        this.sonidoNotificacion.setEnabled(this.soundEnabled);
                    }
                    if (dispositivoActual.selectedSound) {
                        localStorage.setItem('selectedSound', dispositivoActual.selectedSound);
                    }
                    if (dispositivoActual.soundVolume) {
                        this.soundVolume = dispositivoActual.soundVolume;
                        this.sonidoNotificacion.setGlobalVolume(this.soundVolume);
                        localStorage.setItem('soundVolume', this.soundVolume);
                    }
                } else {
                    const savedSoundEnabled = localStorage.getItem('soundEnabled');
                    if (savedSoundEnabled !== null) {
                        this.soundEnabled = savedSoundEnabled === 'true';
                        this.sonidoNotificacion.setEnabled(this.soundEnabled);
                    }
                    const savedVolume = localStorage.getItem('soundVolume');
                    if (savedVolume !== null) {
                        this.soundVolume = parseFloat(savedVolume);
                        this.sonidoNotificacion.setGlobalVolume(this.soundVolume);
                    }
                }
            }
        } catch (error) {
            this.sonidoNotificacion = null;
        }
    }

    _getDeviceId() {
        let deviceId = localStorage.getItem('fcm_device_id');
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('fcm_device_id', deviceId);
        }
        return deviceId;
    }

    _determinarSonidoPorNotificacion(notificacion) {
        if (this.sonidoNotificacion) {
            return this.sonidoNotificacion.determinarSonidoParaNotificacion(notificacion);
        }
        if (notificacion.esMedicalAlarm || notificacion.typeId === 584) return 'alarma-medica';
        if (notificacion.esAlarma || notificacion.tipo === 'alarma') return 'alarma-intrusion';
        if (notificacion.nivelRiesgo === 'critico') return 'alarma-intrusion';
        if (notificacion.tipo === 'incidencia' || notificacion.tipo === 'canalizacion') return 'nueva-incidencia';
        if (notificacion.tipo === 'seguimiento' || notificacion.tipo === 'actualizacion' || notificacion.tipo === 'comentario') {
            return 'nuevo-seguimiento';
        }
        return 'notificacion-general';
    }

    async _reproducirSonido(notificacion) {
        if (!this.soundEnabled || !this.sonidoNotificacion) return;
        try {
            await this.sonidoNotificacion.playForNotificacion(notificacion, this.soundVolume);
        } catch (error) { }
    }

    // ========== ATENCIÓN DE EVENTOS ==========
    async _initAtencionEventosManager() {
        try {
            const { AtencionEventosManager } = await import("/components/atencionEventos.js");
            this.atencionEventosManager = new AtencionEventosManager();
            await this.atencionEventosManager.inicializadoPromise;

            // FORZAR que el administrador siempre pueda atender eventos
            this.atencionEventosManager.esAreaSeguridad = true;
            this.esAreaSeguridad = true;

            // SOBREESCRIBIR esNotificacionEvento para que siempre retorne true para el admin
            // (el admin puede atender CUALQUIER notificación de evento)
            const originalEsNotificacionEvento = this.atencionEventosManager.esNotificacionEvento.bind(this.atencionEventosManager);
            this.atencionEventosManager.esNotificacionEvento = (notif) => {
                // Usar el mismo detector que ya funciona en el navbar
                const esEvento = this._esNotificacionEvento(notif);
                return esEvento;
            };

        } catch (error) {
            console.warn("⚠️ Navbar Admin: No se pudo cargar AtencionEventosManager:", error);
            this.atencionEventosManager = null;
            this.esAreaSeguridad = false;
        }
    }

    // ========== PERMISOS DEL PLAN ==========
    async cargarPermisosDelPlan() {
        try {
            if (!this.currentAdmin || !this.currentAdmin.id) {
                this.permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };
                this.actualizarNavbarSegunPermisos();
                return;
            }

            const planId = this.currentAdmin.plan;

            if (!planId || planId === 'sin-plan' || planId === 'gratis') {
                this.permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };
                this.actualizarNavbarSegunPermisos();
                return;
            }

            const { PlanPersonalizadoManager } = await import('/clases/plan.js');
            this.planManager = new PlanPersonalizadoManager();
            const plan = await this.planManager.obtenerPorId(planId);

            if (!plan) {
                this.permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };
                this.actualizarNavbarSegunPermisos();
                return;
            }

            const mapasActivos = plan.mapasActivos;
            const tieneIncidencias = mapasActivos.incidencias === true;
            const tieneMonitoreo = mapasActivos.alertas === true;

            const permisosIncidencias = [];
            if (tieneIncidencias) {
                const moduloIncidencias = plan.obtenerMapasCompletos?.().find(m => m.id === 'incidencias');
                if (moduloIncidencias && moduloIncidencias.permisosActivos) {
                    moduloIncidencias.permisosActivos.forEach(permiso => {
                        permisosIncidencias.push(permiso.id);
                    });
                }
            }

            this.permisosPlan = {
                incidencias: tieneIncidencias,
                monitoreo: tieneMonitoreo,
                permisosIncidencias: permisosIncidencias
            };

            this.actualizarNavbarSegunPermisos();
        } catch (error) {
            this.permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };
            this.actualizarNavbarSegunPermisos();
        }
    }

    actualizarNavbarSegunPermisos() {
        const incidenciasSection = document.getElementById('incidenciasSection');
        const incidenciasDropdownOptions = document.getElementById('incidenciasDropdownOptions');

        if (incidenciasSection) {
            incidenciasSection.style.display = this.permisosPlan.incidencias ? 'block' : 'none';
        }

        const monitoreoSection = document.getElementById('monitoreoSection');
        if (monitoreoSection) {
            monitoreoSection.style.display = this.permisosPlan.monitoreo ? 'block' : 'none';
        }

        if (this.permisosPlan.incidencias && incidenciasDropdownOptions) {
            const opcionesIncidencias = incidenciasDropdownOptions.querySelectorAll('.incidencia-option');
            opcionesIncidencias.forEach(opcion => {
                const permisoId = opcion.dataset.permisoId;
                const tienePermiso = this.permisosPlan.permisosIncidencias.includes(permisoId);
                opcion.style.display = tienePermiso ? 'flex' : 'none';
            });

            const opcionesVisibles = Array.from(opcionesIncidencias).some(opt => opt.style.display !== 'none');
            if (!opcionesVisibles) {
                incidenciasSection.style.display = 'none';
            }
        }
    }

    // ========== NOTIFICACIONES (IGUAL QUE COLABORADOR) ==========
    async _initNotificacionManager() {
        try {
            const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
            this.notificacionManager = new NotificacionAreaManager();
            if (this.notificacionManager && this.currentAdmin) {
                this.notificacionManager.usuarioActual = {
                    ...this.notificacionManager.usuarioActual,
                    ...this.currentAdmin,
                    esAdmin: true,
                    rol: 'administrador'
                };
            }
        } catch (error) { }
    }

    async _cargarNotificaciones(forzarSonido = false, conteoPrevio = null) {
        if (!this.notificacionManager || !this.currentAdmin?.id || !this.currentAdmin?.organizacionCamelCase) {
            return;
        }

        try {
            const promesas = [
                conteoPrevio !== null ? Promise.resolve(conteoPrevio) :
                    this.notificacionManager.obtenerConteoNoLeidas(
                        this.currentAdmin.id,
                        this.currentAdmin.organizacionCamelCase
                    ),
                this.notificacionManager.obtenerNotificacionesPaginadas(
                    this.currentAdmin.id,
                    this.currentAdmin.organizacionCamelCase,
                    {
                        filtros: { tipo: 'todos', nivelRiesgo: 'todos', subtipoEvento: 'todos' },
                        pagina: 1,
                        itemsPorPagina: 5
                    }
                )
            ];

            const [conteoResult, resultado] = await Promise.all(promesas);
            this.notificacionesNoLeidas = conteoResult;
            this._actualizarBadgeNotificaciones();

            const notificaciones = resultado.notificaciones;

            // Detectar realmente nuevas y recientes para sonido
            const notificacionesExistentesIds = new Set(this.notificaciones.map(n => n.id));
            const nuevasNoLeidas = notificaciones.filter(n =>
                !n.leida && !notificacionesExistentesIds.has(n.id)
            );

            const ahora = new Date();
            const realmenteNuevas = nuevasNoLeidas.filter(n => {
                const fechaNotificacion = n.fecha || new Date(0);
                const diffSegundos = (ahora - fechaNotificacion) / 1000;
                return diffSegundos < 30;
            });

            if (realmenteNuevas.length > 0 && forzarSonido === true) {
                for (const notif of realmenteNuevas) {
                    await this._reproducirSonido(notif);
                    await new Promise(r => setTimeout(r, 300));
                }
                this._mostrarNotificacionSistema(realmenteNuevas);
            }

            this.notificaciones = notificaciones;
            this._renderizarNotificaciones();

        } catch (error) {
            console.error('❌ Error cargando notificaciones admin:', error);
        }
    }

    _iniciarListenerNotificaciones() {
        if (!this.notificacionManager || !this.currentAdmin?.id || !this.currentAdmin?.organizacionCamelCase) {
            return;
        }

        if (this.intervalNotificaciones) {
            clearInterval(this.intervalNotificaciones);
        }

        this.intervalNotificaciones = setInterval(async () => {
            try {
                const nuevoConteo = await this.notificacionManager.obtenerConteoNoLeidas(
                    this.currentAdmin.id,
                    this.currentAdmin.organizacionCamelCase
                );

                if (nuevoConteo !== this.notificacionesNoLeidas) {
                    await this._cargarNotificaciones(true, nuevoConteo);
                }
            } catch (error) { }
        }, 2000);
    }

    _actualizarBadgeNotificaciones() {
        const badge = document.getElementById('notificacionesBadge');
        if (!badge) return;

        if (this.notificacionesNoLeidas > 0) {
            badge.textContent = this.notificacionesNoLeidas > 99 ? '99+' : this.notificacionesNoLeidas;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    _renderizarNotificaciones() {
        const container = document.getElementById('notificacionesLista');
        if (!container) return;

        if (this.notificaciones.length === 0) {
            container.innerHTML = `
            <div class="notificaciones-vacia">
                <i class="fas fa-bell-slash"></i>
                <p>No hay notificaciones</p>
            </div>
        `;
            return;
        }

        let html = '';
        this.notificaciones.forEach(notif => {
            const notifUI = notif.toUI ? notif.toUI() : {
                titulo: notif.titulo,
                mensaje: notif.mensaje,
                icono: notif.getIcono ? notif.getIcono() : 'fa-bell',
                color: notif.getColor ? notif.getColor() : '#007bff',
                sucursalNombre: notif.sucursalNombre,
                nivelRiesgo: notif.nivelRiesgo,
                tiempoRelativo: notif.getTiempoRelativo ? notif.getTiempoRelativo() : '',
                urlDestino: notif.urlDestino || (notif.incidenciaId ? `/usuarios/administrador/verIncidencias/verIncidencias.html?id=${notif.incidenciaId}` : '#'),
                leida: notif.leida || false,
                esEvento: this._esNotificacionEvento(notif),
                eventId: notif.eventId || notif.detalles?.eventId,
                estadoEvento: notif.estadoEvento || 'pendiente',
                nombreUsuarioAtencion: notif.nombreUsuarioAtencion || null,
                mensajeRespuesta: notif.mensajeRespuesta || null
            };

            const eventoClass = notifUI.esEvento ? 'notificacion-evento' : '';
            let estadoBadge = '';
            let estadoColor = '';
            if (notifUI.estadoEvento === 'atendido') {
                estadoBadge = '<span style="background: #2ecc71; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; margin-left: 8px;"><i class="fas fa-check-circle"></i> Atendido</span>';
                estadoColor = '#2ecc71';
            } else if (notifUI.estadoEvento === 'ignorado') {
                estadoBadge = '<span style="background: #95a5a6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; margin-left: 8px;"><i class="fas fa-ban"></i> Ignorado</span>';
                estadoColor = '#95a5a6';
            }

            html += `
            <div class="notificacion-item ${eventoClass}" data-id="${notif.id}" data-url="${notifUI.urlDestino}">
                <div class="notificacion-icono" style="background-color: ${estadoColor || notifUI.color}20; color: ${estadoColor || notifUI.color}">
                    <i class="fas ${notifUI.icono}"></i>
                </div>
                <div class="notificacion-contenido">
                    <div class="notificacion-titulo">
                        ${notif.esMedicalAlarm ? '' : (notif.esAlarma ? '' : '')} ${this._escapeHTML(notifUI.titulo)}
                        ${estadoBadge}
                    </div>
                    <div class="notificacion-mensaje">${this._escapeHTML(notifUI.mensaje)}</div>
                    ${notifUI.nombreUsuarioAtencion ? `
                        <div style="font-size: 11px; color: #888; margin-top: 4px;">
                            <i class="fas fa-user-check"></i> ${this._escapeHTML(notifUI.nombreUsuarioAtencion)}
                            ${notifUI.mensajeRespuesta ? `: "${this._escapeHTML(notifUI.mensajeRespuesta)}"` : ''}
                        </div>
                    ` : ''}
                    <div class="notificacion-detalles">
                        ${notifUI.sucursalNombre ? `<span><i class="fas fa-store"></i> ${this._escapeHTML(notifUI.sucursalNombre)}</span>` : ''}
                        ${notifUI.nivelRiesgo ? `<span class="riesgo-${notifUI.nivelRiesgo}"><i class="fas fa-exclamation-triangle"></i> ${notifUI.nivelRiesgo}</span>` : ''}
                        ${notif.panelAlias ? `<span><i class="fas fa-microchip"></i> ${this._escapeHTML(notif.panelAlias)}</span>` : ''}
                    </div>
                    <div class="notificacion-tiempo">${this._escapeHTML(notifUI.tiempoRelativo)}</div>
                </div>
                <div class="notificacion-estado ${notifUI.leida ? 'leida' : 'no-leida'}"></div>
            </div>
        `;
        });

        html += `
        <div class="notificaciones-ver-mas">
            <a href="#" class="ver-todas-notificaciones">Ver todas las notificaciones</a>
        </div>
    `;

        container.innerHTML = html;

        // Eventos de clic
        container.querySelectorAll('.notificacion-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = item.dataset.id;
                const url = item.dataset.url;

                const notificacion = this.notificaciones.find(n => n.id === id);
                if (!notificacion) return;

                if (this._esNotificacionEvento(notificacion)) {
                    e.preventDefault();
                    await this._manejarClicNotificacionEvento(notificacion, item);
                    return;
                }

                // Incidencia/canalización
                if (this.notificacionManager && id) {
                    await this.notificacionManager.marcarComoLeida(
                        this.currentAdmin.id,
                        id,
                        this.currentAdmin.organizacionCamelCase
                    );

                    const index = this.notificaciones.findIndex(n => n.id === id);
                    if (index !== -1) this.notificaciones.splice(index, 1);
                    this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                    this._actualizarBadgeNotificaciones();
                    this._renderizarNotificaciones();

                    if (url && url !== '#') {
                        window.location.href = url;
                    }
                }
            });
        });

        const verTodasLink = container.querySelector('.ver-todas-notificaciones');
        if (verTodasLink) {
            verTodasLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._mostrarModalNotificaciones();
            });
        }
    }

    _esNotificacionEvento(notificacion) {
        if (!notificacion) return false;
        if (notificacion.tipo === "evento_monitoreo" || notificacion.tipo === "alarma" || notificacion.tipo === "monitoreo") return true;
        const detalles = notificacion.detalles || {};
        if (detalles.eventId || detalles.panel_serial || detalles.type_id) return true;
        return !!(notificacion.eventId || notificacion.panelSerial || notificacion.typeId);
    }

    async _manejarClicNotificacionEvento(notificacion, elementoHTML) {
        try {
            // OBTENER ESTADO REAL DEL EVENTO DESDE FIRESTORE
            let estadoReal = notificacion.estadoEvento || (notificacion.detalles?.estadoEvento) || 'pendiente';

            try {
                const { Evento } = await import('/clases/evento.js');
                const eventId = notificacion.eventId || notificacion.detalles?.eventId;
                if (eventId) {
                    const eventoReal = await Evento.obtenerPorId(eventId);
                    if (eventoReal && eventoReal.estadoEvento) {
                        estadoReal = eventoReal.estadoEvento;
                    }
                }
            } catch (e) {
                console.warn('No se pudo obtener evento real:', e);
            }

            // SI EL EVENTO YA FUE ATENDIDO/IGNORADO → ELIMINAR NOTIFICACIÓN DIRECTAMENTE
            if (estadoReal !== 'pendiente') {
                await this.notificacionManager?.marcarComoLeida(
                    this.currentAdmin.id,
                    notificacion.id,
                    this.currentAdmin.organizacionCamelCase
                );
                const index = this.notificaciones.findIndex(n => n.id === notificacion.id);
                if (index !== -1) this.notificaciones.splice(index, 1);
                this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                this._actualizarBadgeNotificaciones();
                this._renderizarNotificaciones();
                return;
            }

            // SI EL EVENTO ESTÁ PENDIENTE → MOSTRAR MODAL DE ATENCIÓN
            if (this.atencionEventosManager) {
                if (elementoHTML) {
                    elementoHTML.style.opacity = "0.7";
                    elementoHTML.style.pointerEvents = "none";
                }

                const resultado = await this.atencionEventosManager.procesarNotificacionEvento(notificacion);

                if (resultado) {
                    await this.notificacionManager?.marcarComoLeida(
                        this.currentAdmin.id,
                        notificacion.id,
                        this.currentAdmin.organizacionCamelCase
                    );
                    const index = this.notificaciones.findIndex(n => n.id === notificacion.id);
                    if (index !== -1) this.notificaciones.splice(index, 1);
                    this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                    this._actualizarBadgeNotificaciones();
                    this._renderizarNotificaciones();
                }

                if (elementoHTML) {
                    elementoHTML.style.opacity = "1";
                    elementoHTML.style.pointerEvents = "auto";
                }
            }
        } catch (error) {
            console.error("Error:", error);
            try {
                await this.notificacionManager?.marcarComoLeida(
                    this.currentAdmin.id,
                    notificacion?.id,
                    this.currentAdmin.organizacionCamelCase
                );
                const index = this.notificaciones.findIndex(n => n.id === notificacion?.id);
                if (index !== -1) this.notificaciones.splice(index, 1);
                this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                this._actualizarBadgeNotificaciones();
                this._renderizarNotificaciones();
            } catch (e) { }

            if (elementoHTML) {
                elementoHTML.style.opacity = "1";
                elementoHTML.style.pointerEvents = "auto";
            }
        }
    }

    async _mostrarInfoEventoSoloLectura(notificacion) {
        try {
            const { Evento } = await import("/clases/evento.js");
            const eventId = notificacion.eventId || (notificacion.detalles?.eventId);

            let evento = null;
            let descripcion = notificacion.mensaje || 'Evento sin descripción';
            let panelAlias = notificacion.panelAlias || 'Desconocido';
            let email = 'N/A';
            let fecha = notificacion.fecha ? new Date(notificacion.fecha).toLocaleString() : 'Desconocida';
            let estadoEvento = notificacion.estadoEvento || (notificacion.detalles?.estadoEvento) || 'pendiente';
            let nombreUsuarioAtencion = notificacion.nombreUsuarioAtencion || null;
            let mensajeRespuesta = notificacion.mensajeRespuesta || null;

            // Intentar obtener más detalles del evento desde Firestore
            if (eventId) {
                try {
                    evento = await Evento.obtenerPorId(eventId);
                    if (evento) {
                        descripcion = evento.description || descripcion;
                        panelAlias = evento.panel_alias || evento.panel_serial || panelAlias;
                        email = evento.email_asociado || 'N/A';
                        fecha = evento.fechaFormateada || fecha;
                        estadoEvento = evento.estadoEvento || estadoEvento;
                        nombreUsuarioAtencion = evento.nombreUsuarioAtencion || nombreUsuarioAtencion;
                        mensajeRespuesta = evento.mensajeRespuesta || mensajeRespuesta;
                    }
                } catch (e) {
                    console.warn('No se pudo obtener el evento desde Firestore, usando datos de notificación:', e);
                }
            }

            const estadoColor = estadoEvento === "pendiente" ? "#f39c12" :
                (estadoEvento === "atendido" ? "#2ecc71" : "#95a5a6");
            const estadoTexto = estadoEvento === "pendiente" ? "⏳ Pendiente" :
                (estadoEvento === "atendido" ? "Atendido" : "Ignorado");

            Swal.fire({
                title: "Información del Evento",
                html: `
                <div style="text-align: left;">
                    <div style="padding: 15px; background: ${estadoColor}20; border-left: 4px solid ${estadoColor}; border-radius: 8px; margin-bottom: 15px;">
                        <strong>${this._escapeHTML(descripcion)}</strong>
                    </div>
                    <table style="width: 100%; text-align: left;">
                        <tr><td><strong>Panel:</strong></td><td>${this._escapeHTML(panelAlias)}</td></tr>
                        <tr><td><strong>Email:</strong></td><td>${this._escapeHTML(email)}</td></tr>
                        <tr><td><strong>Fecha:</strong></td><td>${fecha}</td></tr>
                        <tr><td><strong>Estado:</strong></td><td><span style="color: ${estadoColor};">${estadoTexto}</span></td></tr>
                    </table>
                    ${estadoEvento === 'atendido' && nombreUsuarioAtencion ? `<div style="margin-top: 15px; padding: 10px; background: rgba(46,204,113,0.1); border-radius: 8px;"><strong>Atendido por:</strong> ${this._escapeHTML(nombreUsuarioAtencion || "Sistema")}${mensajeRespuesta ? `<br><strong>Mensaje:</strong> "${this._escapeHTML(mensajeRespuesta)}"` : ""}</div>` : ""}
                    ${estadoEvento === 'ignorado' && nombreUsuarioAtencion ? `<div style="margin-top: 15px; padding: 10px; background: rgba(149,165,166,0.1); border-radius: 8px;"><strong>Ignorado por:</strong> ${this._escapeHTML(nombreUsuarioAtencion || "Sistema")}${mensajeRespuesta ? `<br><strong>Motivo:</strong> "${this._escapeHTML(mensajeRespuesta)}"` : ""}</div>` : ""}
                </div>
            `,
                width: "500px",
                background: "#1a1a2e",
                color: "#ffffff",
                confirmButtonText: "Cerrar",
                confirmButtonColor: "#6c757d",
                showCancelButton: false
            });
        } catch (error) {
            console.error("❌ Error mostrando info de evento:", error);
            // NO lanzar excepción, solo mostrar mensaje de error
            Swal.fire({
                icon: "info",
                title: "Información del Evento",
                text: notificacion.mensaje || "Evento procesado",
                background: "#1a1a2e",
                color: "#ffffff",
                confirmButtonText: "Cerrar",
                confirmButtonColor: "#6c757d"
            });
        }
    }

    async _mostrarInfoEventoSoloLectura(notificacion) {
        try {
            const { Evento } = await import("/clases/evento.js");
            const eventId = notificacion.eventId || notificacion.detalles?.eventId;
            if (!eventId) throw new Error("No se encontró el ID del evento");

            Swal.showLoading();
            const evento = await Evento.obtenerPorId(eventId);
            if (!evento) throw new Error("No se pudo cargar la información del evento");

            const estadoColor = evento.estadoEvento === "pendiente" ? "#f39c12" :
                (evento.estadoEvento === "atendido" ? "#2ecc71" : "#95a5a6");

            Swal.fire({
                title: "Información del Evento",
                html: `
                <div style="text-align: left;">
                    <div style="padding: 15px; background: ${estadoColor}20; border-left: 4px solid ${estadoColor}; border-radius: 8px; margin-bottom: 15px;">
                        <strong>${this._escapeHTML(evento.description || "Evento sin descripción")}</strong>
                    </div>
                    <table style="width: 100%; text-align: left;">
                        <tr><td><strong>Panel:</strong></td><td>${this._escapeHTML(evento.panel_alias || evento.panel_serial)}</td></tr>
                        <tr><td><strong>Email:</strong></td><td>${this._escapeHTML(evento.email_asociado || "N/A")}</td></tr>
                        <tr><td><strong>Fecha:</strong></td><td>${evento.fechaFormateada}</td></tr>
                        <tr><td><strong>Estado:</strong></td><td><span style="color: ${estadoColor};">${evento.estadoEvento === "pendiente" ? "⏳ Pendiente" : (evento.estadoEvento === "atendido" ? "Atendido" : "Ignorado")}</span></td></tr>
                    </table>
                    ${evento.atendido ? `<div style="margin-top: 15px; padding: 10px; background: rgba(46,204,113,0.1); border-radius: 8px;"><strong>Atendido por:</strong> ${this._escapeHTML(evento.nombreUsuarioAtencion || "Sistema")}${evento.mensajeRespuesta ? `<br><strong>Mensaje:</strong> "${this._escapeHTML(evento.mensajeRespuesta)}"` : ""}</div>` : ""}
                    ${evento.estadoEvento === "ignorado" ? `<div style="margin-top: 15px; padding: 10px; background: rgba(149,165,166,0.1); border-radius: 8px;"><strong>Ignorado por:</strong> ${this._escapeHTML(evento.nombreUsuarioAtencion || "Sistema")}${evento.mensajeRespuesta ? `<br><strong>Motivo:</strong> "${this._escapeHTML(evento.mensajeRespuesta)}"` : ""}</div>` : ""}
                </div>
            `,
                width: "500px",
                background: "#1a1a2e",
                color: "#ffffff",
                confirmButtonText: "Cerrar",
                confirmButtonColor: "#6c757d",
            });
        } catch (error) {
            console.error("❌ Error mostrando info de evento:", error);
            Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar la información del evento", background: "#1a1a2e", color: "#ffffff" });
        }
    }

    async _marcarTodasLeidas() {
        if (!this.notificacionManager || !this.currentAdmin?.id || !this.currentAdmin?.organizacionCamelCase) return;
        try {
            await this.notificacionManager.marcarTodasComoLeidas(
                this.currentAdmin.id,
                this.currentAdmin.organizacionCamelCase
            );
            this.notificaciones = [];
            this.notificacionesNoLeidas = 0;
            this._actualizarBadgeNotificaciones();
            this._renderizarNotificaciones();
        } catch (error) { }
    }

    _mostrarModalNotificaciones() {
        if (typeof Swal === "undefined") {
            window.location.href = "#";
            return;
        }

        const self = this;
        this.modalNotificacionesState = {
            paginaActual: 1,
            itemsPorPagina: 10,
            totalPaginas: 0,
            totalNotificaciones: 0,
            filtros: { tipo: "todos", nivelRiesgo: "todos", subtipoEvento: "todos" },
            notificaciones: []
        };

        const generarOpcionesFiltroSecundario = (tipo, filtros) => {
            if (tipo === 'evento') {
                return `
            <option value="todos" ${filtros.subtipoEvento === "todos" ? "selected" : ""}>Todos los eventos</option>
            <option value="medical" ${filtros.subtipoEvento === "medical" ? "selected" : ""}>Alarmas Médicas</option>
            <option value="alarma" ${filtros.subtipoEvento === "alarma" ? "selected" : ""}>Alarmas de Intrusión</option>
            <option value="incendio" ${filtros.subtipoEvento === "incendio" ? "selected" : ""}>Alarmas de Incendio</option>
            <option value="panico" ${filtros.subtipoEvento === "panico" ? "selected" : ""}>Pánico</option>
            <option value="evento" ${filtros.subtipoEvento === "evento" ? "selected" : ""}>Eventos Normales</option>
        `;
            } else {
                return `
            <option value="todos" ${filtros.nivelRiesgo === "todos" ? "selected" : ""}>Todos los riesgos</option>
            <option value="bajo" ${filtros.nivelRiesgo === "bajo" ? "selected" : ""}>Bajo</option>
            <option value="medio" ${filtros.nivelRiesgo === "medio" ? "selected" : ""}>Medio</option>
            <option value="alto" ${filtros.nivelRiesgo === "alto" ? "selected" : ""}>Alto</option>
            <option value="critico" ${filtros.nivelRiesgo === "critico" ? "selected" : ""}>Crítico</option>
        `;
            }
        };

        const renderizarContenidoModal = async (state) => {
            try {
                const resultado = await self.notificacionManager.obtenerNotificacionesPaginadas(
                    self.currentAdmin.id,
                    self.currentAdmin.organizacionCamelCase,
                    {
                        filtros: state.filtros,
                        pagina: state.paginaActual,
                        itemsPorPagina: state.itemsPorPagina,
                    }
                );

                state.totalNotificaciones = resultado.total;
                state.totalPaginas = resultado.totalPaginas;
                state.paginaActual = resultado.pagina;
                const notificaciones = resultado.notificaciones;
                state.notificaciones = notificaciones;

                const filtrosHtml = `
            <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; justify-content: center;">
                <select id="filtroTipoModal" style="padding: 8px 12px; border-radius: 6px; background: #2a2a4a; color: white; border: 1px solid #444; font-size: 13px;">
                    <option value="todos" ${state.filtros.tipo === "todos" ? "selected" : ""}>Todas</option>
                    <option value="canalizacion" ${state.filtros.tipo === "canalizacion" ? "selected" : ""}>Canalizadas</option>
                    <option value="evento" ${state.filtros.tipo === "evento" ? "selected" : ""}>Eventos</option>
                </select>
                <select id="filtroSecundarioModal" style="padding: 8px 12px; border-radius: 6px; background: #2a2a4a; color: white; border: 1px solid #444; font-size: 13px;">
                    ${generarOpcionesFiltroSecundario(state.filtros.tipo, state.filtros)}
                </select>
            </div>
        `;

                let notificacionesHtml = "";
                if (notificaciones.length === 0) {
                    notificacionesHtml = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <i class="fas fa-bell-slash" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>No hay notificaciones con estos filtros</p>
                </div>
            `;
                } else {
                    notificacionesHtml = '<div style="max-height: 400px; overflow-y: auto;">';
                    notificaciones.forEach(notif => {
                        const notifUI = notif.toUI ? notif.toUI() : {
                            titulo: notif.titulo, mensaje: notif.mensaje,
                            icono: notif.getIcono ? notif.getIcono() : "fa-bell",
                            color: notif.getColor ? notif.getColor() : "#007bff",
                            tiempoRelativo: notif.getTiempoRelativo ? notif.getTiempoRelativo() : "",
                            urlDestino: notif.urlDestino || (notif.incidenciaId ? `/usuarios/administrador/verIncidencias/verIncidencias.html?id=${notif.incidenciaId}` : "#"),
                            leida: notif.leida || false,
                            esEvento: self._esNotificacionEvento(notif),
                        };
                        const eventoIcono = notifUI.esEvento ? (notif.esMedicalAlarm ? "" : (notif.esAlarma ? "" : "")) : "";
                        const estadoEvento = notif.estadoEvento || (notif.detalles?.estadoEvento) || 'pendiente';

                        notificacionesHtml += `
                    <div class="notificacion-item-modal" data-id="${notif.id}" data-url="${notifUI.urlDestino}" data-es-evento="${notifUI.esEvento}" data-estado="${estadoEvento}" style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-bottom: 1px solid #333; cursor: pointer; background: ${notifUI.leida ? 'transparent' : 'rgba(0,207,255,0.05)'};">
                        <div class="notificacion-icono" style="width: 40px; height: 40px; border-radius: 50%; background-color: ${notifUI.color}20; color: ${notifUI.color}; display: flex; align-items: center; justify-content: center;">
                            <i class="fas ${notifUI.icono}"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 4px;">${eventoIcono} ${self._escapeHTML(notifUI.titulo)}</div>
                            <div style="font-size: 13px; color: #aaa; margin-bottom: 4px;">${self._escapeHTML(notifUI.mensaje)}</div>
                            ${notif.nombreUsuarioAtencion ? `<div style="font-size: 11px; color: #888; margin-bottom: 4px;"><i class="fas fa-user-check"></i> ${self._escapeHTML(notif.nombreUsuarioAtencion)}${notif.mensajeRespuesta ? `: "${self._escapeHTML(notif.mensajeRespuesta)}"` : ''}</div>` : ''}
                            <div style="font-size: 11px; color: #666;">${self._escapeHTML(notifUI.tiempoRelativo)}</div>
                            ${estadoEvento !== 'pendiente' ? `<div style="margin-top: 8px; padding: 4px 8px; background: rgba(${estadoEvento === 'atendido' ? '46,204,113' : '149,165,166'},0.2); border-radius: 4px; font-size: 11px; color: ${estadoEvento === 'atendido' ? '#2ecc71' : '#95a5a6'};"><i class="fas ${estadoEvento === 'atendido' ? 'fa-check-circle' : 'fa-ban'}"></i> ${estadoEvento === 'atendido' ? 'Atendido' : 'Ignorado'}${notif.nombreUsuarioAtencion ? ` por ${self._escapeHTML(notif.nombreUsuarioAtencion)}` : ''}</div>` : ''}
                        </div>
                        ${!notifUI.leida ? '<div style="width: 8px; height: 8px; border-radius: 50%; background-color: #007bff;"></div>' : ''}
                    </div>
                `;
                    });
                    notificacionesHtml += "</div>";
                }

                let paginacionHtml = "";
                if (state.totalPaginas > 1) {
                    paginacionHtml = `
                <div style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 15px; padding-top: 10px; border-top: 1px solid #333;">
                    <button id="modalPaginaAnterior" ${state.paginaActual === 1 ? "disabled" : ""} style="padding: 6px 12px; background: ${state.paginaActual === 1 ? "#333" : "#00cfff"}; border: none; border-radius: 4px; color: white; cursor: ${state.paginaActual === 1 ? "not-allowed" : "pointer"}; opacity: ${state.paginaActual === 1 ? "0.5" : "1"};"><i class="fas fa-chevron-left"></i></button>
                    <span style="color: #aaa; font-size: 13px;">Página ${state.paginaActual} de ${state.totalPaginas}</span>
                    <button id="modalPaginaSiguiente" ${state.paginaActual === state.totalPaginas ? "disabled" : ""} style="padding: 6px 12px; background: ${state.paginaActual === state.totalPaginas ? "#333" : "#00cfff"}; border: none; border-radius: 4px; color: white; cursor: ${state.paginaActual === state.totalPaginas ? "not-allowed" : "pointer"}; opacity: ${state.paginaActual === state.totalPaginas ? "0.5" : "1"};"><i class="fas fa-chevron-right"></i></button>
                    <span style="color: #666; font-size: 12px; margin-left: 10px;">Total: ${state.totalNotificaciones} notificaciones</span>
                </div>
            `;
                } else if (state.totalNotificaciones > 0) {
                    paginacionHtml = `<div style="text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid #333; color: #666; font-size: 12px;">Total: ${state.totalNotificaciones} notificaciones</div>`;
                }

                return { filtrosHtml, notificacionesHtml, paginacionHtml };
            } catch (error) {
                console.error("Error cargando notificaciones paginadas:", error);
                return { filtrosHtml: '<div style="color: #e74c3c; text-align: center;">Error al cargar filtros</div>', notificacionesHtml: '<div style="color: #e74c3c; text-align: center; padding: 40px;">Error al cargar notificaciones</div>', paginacionHtml: "" };
            }
        };

        renderizarContenidoModal(this.modalNotificacionesState).then(({ filtrosHtml, notificacionesHtml, paginacionHtml }) => {
            Swal.fire({
                title: "Todas las Notificaciones",
                html: `<div id="modalNotificacionesContainer">${filtrosHtml}<div id="modalNotificacionesLista">${notificacionesHtml}</div><div id="modalNotificacionesPaginacion">${paginacionHtml}</div></div>`,
                width: "650px", background: "#1a1a1a", color: "#fff", showConfirmButton: false, showCloseButton: true,
                didOpen: () => {
                    const filtroTipo = document.getElementById("filtroTipoModal");
                    const filtroSecundario = document.getElementById("filtroSecundarioModal");

                    const actualizarFiltroSecundario = () => {
                        const tipoSeleccionado = filtroTipo?.value || "todos";
                        const filtroSecundarioEl = document.getElementById("filtroSecundarioModal");
                        if (filtroSecundarioEl) filtroSecundarioEl.innerHTML = generarOpcionesFiltroSecundario(tipoSeleccionado, self.modalNotificacionesState.filtros);
                    };

                    const aplicarFiltros = async () => {
                        const tipoSeleccionado = filtroTipo?.value || "todos";
                        const secundarioValue = filtroSecundario?.value || "todos";
                        self.modalNotificacionesState.filtros = {
                            tipo: tipoSeleccionado,
                            nivelRiesgo: tipoSeleccionado !== 'evento' ? secundarioValue : 'todos',
                            subtipoEvento: tipoSeleccionado === 'evento' ? secundarioValue : 'todos'
                        };
                        self.modalNotificacionesState.paginaActual = 1;
                        const { notificacionesHtml: nuevasNotif, paginacionHtml: nuevaPagin } = await renderizarContenidoModal(self.modalNotificacionesState);
                        document.getElementById("modalNotificacionesLista").innerHTML = nuevasNotif;
                        document.getElementById("modalNotificacionesPaginacion").innerHTML = nuevaPagin;
                        configurarEventListeners();
                    };

                    if (filtroTipo) { filtroTipo.addEventListener("change", () => { actualizarFiltroSecundario(); aplicarFiltros(); }); }
                    if (filtroSecundario) { filtroSecundario.addEventListener("change", aplicarFiltros); }

                    const configurarEventListeners = () => {
                        document.querySelectorAll(".notificacion-item-modal").forEach(item => {
                            item.addEventListener("click", async (e) => {
                                e.stopPropagation();
                                const id = item.dataset.id;
                                const url = item.dataset.url;
                                const esEvento = item.dataset.esEvento === "true";
                                const notif = self.modalNotificacionesState.notificaciones.find(n => n.id === id);
                                if (!notif) return;

                                if (esEvento || self._esNotificacionEvento(notif)) {
                                    Swal.close();
                                    // Llamar al mismo flujo que se usa en el dropdown
                                    await self._manejarClicNotificacionEvento(notif, item);
                                    return;
                                }

                                // Incidencia / canalización
                                if (self.notificacionManager && id) {
                                    await self.notificacionManager.marcarComoLeida(self.currentAdmin.id, id, self.currentAdmin.organizacionCamelCase);
                                    const idx = self.notificaciones.findIndex(n => n.id === id);
                                    if (idx !== -1) self.notificaciones.splice(idx, 1);
                                    self.notificacionesNoLeidas = self.notificaciones.filter(n => !n.leida).length;
                                    self._actualizarBadgeNotificaciones();
                                    self._renderizarNotificaciones();
                                    if (url && url !== "#") window.location.href = url;
                                    Swal.close();
                                }
                            });
                        });

                        const btnAnterior = document.getElementById("modalPaginaAnterior");
                        const btnSiguiente = document.getElementById("modalPaginaSiguiente");
                        if (btnAnterior) btnAnterior.addEventListener("click", async () => {
                            if (self.modalNotificacionesState.paginaActual > 1) {
                                self.modalNotificacionesState.paginaActual--;
                                const { notificacionesHtml: nHtml, paginacionHtml: pHtml } = await renderizarContenidoModal(self.modalNotificacionesState);
                                document.getElementById("modalNotificacionesLista").innerHTML = nHtml;
                                document.getElementById("modalNotificacionesPaginacion").innerHTML = pHtml;
                                configurarEventListeners();
                            }
                        });
                        if (btnSiguiente) btnSiguiente.addEventListener("click", async () => {
                            if (self.modalNotificacionesState.paginaActual < self.modalNotificacionesState.totalPaginas) {
                                self.modalNotificacionesState.paginaActual++;
                                const { notificacionesHtml: nHtml, paginacionHtml: pHtml } = await renderizarContenidoModal(self.modalNotificacionesState);
                                document.getElementById("modalNotificacionesLista").innerHTML = nHtml;
                                document.getElementById("modalNotificacionesPaginacion").innerHTML = pHtml;
                                configurarEventListeners();
                            }
                        });
                    };
                    configurarEventListeners();
                }
            });
        });
    }

    _mostrarNotificacionSistema(nuevasNoLeidas) {
        if (Notification.permission !== 'granted') return;
        if (nuevasNoLeidas.length === 1) {
            const primera = nuevasNoLeidas[0];
            const notifUI = primera.toUI ? primera.toUI() : { titulo: primera.titulo, mensaje: primera.mensaje };
            new Notification(notifUI.titulo, {
                body: notifUI.mensaje,
                icon: '/assets/images/logo.png',
                badge: '/assets/images/logo.png',
                silent: true,
                vibrate: [200, 100, 200]
            }).onclick = () => {
                window.focus();
                if (primera.urlDestino) window.location.href = primera.urlDestino;
            };
        } else if (nuevasNoLeidas.length > 1) {
            new Notification(`📬 ${nuevasNoLeidas.length} nuevas notificaciones`, {
                body: `Tienes ${nuevasNoLeidas.length} notificaciones sin leer`,
                icon: '/assets/images/logo.png',
                silent: true
            }).onclick = () => {
                window.focus();
                this._mostrarModalNotificaciones();
            };
        }
    }

    _configurarNotificacionesDropdown() {
        const notificacionesBtn = document.getElementById('notificacionesBtn');
        const notificacionesDropdown = document.getElementById('notificacionesDropdown');
        const marcarTodasBtn = document.getElementById('marcarTodasBtn');

        if (!notificacionesBtn || !notificacionesDropdown) return;

        notificacionesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dropdownNotificacionesAbierto = !this.dropdownNotificacionesAbierto;
            notificacionesDropdown.classList.toggle('active', this.dropdownNotificacionesAbierto);

            if (this.dropdownNotificacionesAbierto) {
                this._cargarNotificaciones(false);
            }
        });

        document.addEventListener('click', (e) => {
            if (!notificacionesBtn.contains(e.target) && !notificacionesDropdown.contains(e.target)) {
                this.dropdownNotificacionesAbierto = false;
                notificacionesDropdown.classList.remove('active');
            }
        });

        if (marcarTodasBtn) {
            marcarTodasBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._marcarTodasLeidas();
            });
        }
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

    recargarNotificacionesManual() {
        this._cargarNotificaciones(false);
    }

    // ========== CARGA DE DATOS DEL ADMIN ==========
    loadAdminDataFromLocalStorage() {
        try {
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            if (!isLoggedIn) return false;

            const userDataString = localStorage.getItem('userData');
            if (userDataString) {
                const userData = JSON.parse(userDataString);

                let fotoUsuario = null;
                let fotoOrganizacion = null;

                if (userData.fotoUsuario && userData.fotoUsuario.length > 10) {
                    fotoUsuario = userData.fotoUsuario;
                } else {
                    const userFotoKey = localStorage.getItem('userFoto');
                    if (userFotoKey && userFotoKey.length > 10) fotoUsuario = userFotoKey;
                }

                if (userData.fotoOrganizacion && userData.fotoOrganizacion.length > 10) {
                    fotoOrganizacion = userData.fotoOrganizacion;
                } else {
                    const orgLogoKey = localStorage.getItem('organizacionLogo');
                    if (orgLogoKey && orgLogoKey.length > 10) fotoOrganizacion = orgLogoKey;
                }

                this.currentAdmin = {
                    id: userData.id || localStorage.getItem('userId'),
                    uid: userData.id,
                    correoElectronico: userData.email || localStorage.getItem('userEmail'),
                    nombreCompleto: userData.nombreCompleto || localStorage.getItem('userNombre'),
                    rol: userData.rol || localStorage.getItem('userRole'),
                    organizacion: userData.organizacion || localStorage.getItem('userOrganizacion'),
                    organizacionCamelCase: userData.organizacionCamelCase || localStorage.getItem('userOrganizacionCamelCase'),
                    plan: userData.plan || localStorage.getItem('userPlan'),
                    fechaVencimiento: userData.fechaVencimiento || localStorage.getItem('userFechaVencimiento'),
                    fotoUsuario: fotoUsuario,
                    fotoOrganizacion: fotoOrganizacion,
                    status: userData.status || 'activo',
                    verificado: userData.verificado || true,
                    ultimoAcceso: userData.ultimoAcceso || userData.sessionStart,
                    dispositivos: userData.dispositivos || []
                };
                return true;
            }

            this.currentAdmin = {
                id: localStorage.getItem('userId'),
                correoElectronico: localStorage.getItem('userEmail'),
                nombreCompleto: localStorage.getItem('userNombre'),
                rol: localStorage.getItem('userRole'),
                organizacion: localStorage.getItem('userOrganizacion'),
                organizacionCamelCase: localStorage.getItem('userOrganizacionCamelCase'),
                plan: localStorage.getItem('userPlan'),
                fechaVencimiento: localStorage.getItem('userFechaVencimiento'),
                fotoUsuario: localStorage.getItem('userFoto') || null,
                fotoOrganizacion: localStorage.getItem('organizacionLogo') || null,
                dispositivos: []
            };
            return !!(this.currentAdmin.nombreCompleto && this.currentAdmin.rol);
        } catch (error) {
            return false;
        }
    }

    async loadAdminDataFromFirebase() {
        try {
            const { UserManager } = await import('/clases/user.js');
            this.userManager = new UserManager();
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (this.userManager.currentUser) {
                const firebaseUser = this.userManager.currentUser;
                let needsUpdate = false;

                if (!this.currentAdmin) needsUpdate = true;
                else {
                    if (firebaseUser.nombreCompleto !== this.currentAdmin.nombreCompleto) needsUpdate = true;
                    if (firebaseUser.fotoUsuario !== this.currentAdmin.fotoUsuario) needsUpdate = true;
                    if (firebaseUser.fotoOrganizacion !== this.currentAdmin.fotoOrganizacion) needsUpdate = true;
                    if (firebaseUser.organizacion !== this.currentAdmin.organizacion) needsUpdate = true;
                    if (firebaseUser.correoElectronico !== this.currentAdmin.correoElectronico) needsUpdate = true;
                    if (firebaseUser.rol !== this.currentAdmin.rol) needsUpdate = true;
                    if (firebaseUser.plan !== this.currentAdmin.plan) needsUpdate = true;
                }

                if (needsUpdate) {
                    this.currentAdmin = {
                        ...this.currentAdmin,
                        ...firebaseUser,
                        rol: firebaseUser.rol,
                        plan: firebaseUser.plan,
                        dispositivos: firebaseUser.dispositivos || []
                    };
                    this.updateNavbarWithAdminData();
                    this.updateLocalStorageFromFirebase(firebaseUser);
                    if (this.notificacionManager) {
                        this.notificacionManager.usuarioActual = {
                            ...this.notificacionManager.usuarioActual,
                            ...this.currentAdmin,
                            esAdmin: true,
                            rol: 'administrador'
                        };
                    }
                }
            }
        } catch (error) { }
    }

    updateLocalStorageFromFirebase(userData) {
        try {
            const current = JSON.parse(localStorage.getItem('userData') || '{}');
            const updated = { ...current, id: userData.id, uid: userData.id, email: userData.correoElectronico, nombreCompleto: userData.nombreCompleto, rol: userData.rol, organizacion: userData.organizacion, organizacionCamelCase: userData.organizacionCamelCase, plan: userData.plan, fechaVencimiento: userData.fechaVencimiento, fotoUsuario: userData.fotoUsuario, fotoOrganizacion: userData.fotoOrganizacion, status: userData.status, verificado: userData.verificado, ultimoAcceso: userData.ultimoAcceso, dispositivos: userData.dispositivos || [] };
            localStorage.setItem('userData', JSON.stringify(updated));
            if (userData.fotoUsuario) localStorage.setItem('userFoto', userData.fotoUsuario);
            if (userData.fotoOrganizacion) localStorage.setItem('organizacionLogo', userData.fotoOrganizacion);
            if (userData.nombreCompleto) localStorage.setItem('userNombre', userData.nombreCompleto);
            if (userData.correoElectronico) localStorage.setItem('userEmail', userData.correoElectronico);
            if (userData.rol) localStorage.setItem('userRole', userData.rol);
            if (userData.organizacion) localStorage.setItem('userOrganizacion', userData.organizacion);
            if (userData.organizacionCamelCase) localStorage.setItem('userOrganizacionCamelCase', userData.organizacionCamelCase);
            if (userData.plan) localStorage.setItem('userPlan', userData.plan);
            if (userData.fechaVencimiento) localStorage.setItem('userFechaVencimiento', userData.fechaVencimiento);
        } catch (error) { }
    }

    updateNavbarWithAdminData() {
        if (!this.currentAdmin) {
            const adminName = document.getElementById('adminName');
            const adminEmail = document.getElementById('adminEmail');
            const adminOrganization = document.getElementById('adminOrganization');
            if (adminName) adminName.textContent = 'No autenticado';
            if (adminEmail) adminEmail.textContent = 'Inicia sesión para continuar';
            if (adminOrganization) adminOrganization.textContent = '';
            return;
        }

        this.updateOrganizationLogo();
        this.updateAdminMenuInfo();
    }

    updateOrganizationLogo() {
        const orgLogoImg = document.getElementById('orgLogoImg');
        const orgTextLogo = document.getElementById('orgTextLogo');
        const orgLogoLink = document.getElementById('orgLogoLink');
        if (!orgLogoImg || !orgTextLogo || !orgLogoLink) return;

        if (this.currentAdmin?.fotoOrganizacion && this.currentAdmin.fotoOrganizacion.length > 10) {
            orgLogoImg.src = this.currentAdmin.fotoOrganizacion;
            orgLogoImg.alt = `Logo de ${this.currentAdmin.organizacion || 'Organización'}`;
            orgLogoImg.style.display = 'block';
            orgTextLogo.style.display = 'none';
        } else {
            this.showOrgTextLogo();
        }
        orgLogoLink.href = '/usuarios/administrador/panelControl/panelControl.html';
    }

    showOrgTextLogo() {
        const orgLogoImg = document.getElementById('orgLogoImg');
        const orgTextLogo = document.getElementById('orgTextLogo');
        if (!orgLogoImg || !orgTextLogo) return;
        orgLogoImg.style.display = 'none';
        orgTextLogo.style.display = 'flex';
        const orgName = this.currentAdmin?.organizacion || 'Organización';
        const initials = orgName.split(' ').map(w => w.charAt(0)).join('').toUpperCase().substring(0, 3);
        orgTextLogo.textContent = initials;
        orgTextLogo.title = orgName;
    }

    updateAdminMenuInfo() {
        const adminName = document.getElementById('adminName');
        if (adminName) adminName.textContent = this.currentAdmin?.nombreCompleto || 'Administrador';

        const adminEmail = document.getElementById('adminEmail');
        if (adminEmail) adminEmail.textContent = this.currentAdmin?.correoElectronico || 'No especificado';

        const adminOrganization = document.getElementById('adminOrganization');
        if (adminOrganization) adminOrganization.textContent = this.currentAdmin?.organizacion || 'Sin organización';

        const adminProfileImg = document.getElementById('adminProfileImg');
        const profilePlaceholder = document.getElementById('profilePlaceholder');

        if (adminProfileImg && profilePlaceholder) {
            if (this.currentAdmin?.fotoUsuario && this.currentAdmin.fotoUsuario.length > 10) {
                adminProfileImg.src = this.currentAdmin.fotoUsuario;
                adminProfileImg.style.display = 'block';
                profilePlaceholder.style.display = 'none';
            } else {
                this.showProfilePlaceholder();
            }
        }
    }

    showProfilePlaceholder() {
        const adminProfileImg = document.getElementById('adminProfileImg');
        const profilePlaceholder = document.getElementById('profilePlaceholder');
        if (!adminProfileImg || !profilePlaceholder) return;
        adminProfileImg.style.display = 'none';
        profilePlaceholder.style.display = 'flex';
        const span = profilePlaceholder.querySelector('span');
        if (span && this.currentAdmin?.nombreCompleto) {
            const initials = this.currentAdmin.nombreCompleto.split(' ').map(w => w.charAt(0)).join('').toUpperCase().substring(0, 2);
            span.textContent = initials;
        }
    }

    // ========== NAVBAR HTML Y ESTILOS (se mantiene el menú del admin) ==========
    removeOriginalNavbar() {
        const originalHeader = document.getElementById('main-header');
        originalHeader?.remove();
    }

    createNavbar() {
        this.addStyles();
        this.insertHTML();
        this.adjustBodyPadding();
    }

    addStyles() {
        if (document.getElementById('navbar-complete-styles')) return;

        const styles = /*css*/`
            #complete-navbar {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                z-index: 1000;
                background-color: var(--navbar-bg);
                box-shadow: 0 2px 10px transparent;
                transition: var(--transition-default);
                font-family: var(--font-family-primary);
            }
            
            #complete-navbar.scrolled {
                background-color: var(--navbar-scrolled-bg);
                box-shadow: var(--navbar-scrolled-shadow);
            }
            
            .navbar-top-section {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 5px 20px;
                min-height: 50px;
                margin: 0;
                position: relative;
                width: 100%;
                box-sizing: border-box;
            }
            
            .navbar-left-container {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                gap: 10px;
                flex: 0 0 auto;
                margin-right: auto;
            }
            
            .navbar-logo-link {
                display: flex;
                align-items: center;
                text-decoration: none;
                z-index: 1003;
                height: 70px;
                flex: 0 0 auto;
            }

            .logo-circle-container {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                overflow: hidden;
                border: 3px solid var(--color-accent-primary);
                background-color: var(--color-bg-secondary);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                flex-shrink: 0;
            }

            .navbar-logo-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform var(--transition-default);
                display: block;
            }

            .navbar-logo-link:hover .logo-circle-container {
                transform: scale(1.05);
                border-color: var(--color-accent-secondary);
            }
            
            .logo-separator {
                width: 2px;
                height: 45px;
                background: linear-gradient(
                    to bottom,
                    var(--color-accent-primary) 0%,
                    var(--color-accent-primary) 20%,
                    var(--color-accent-primary) 80%,
                    var(--color-accent-primary) 100%
                );
                margin: 0 5px;
                border-radius: 1px;
                flex-shrink: 0;
            }
            
            .org-text-logo {
                display: none;
                align-items: center;
                justify-content: center;
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background-color: var(--color-accent-primary);
                color: white;
                font-weight: bold;
                font-size: 14px;
                text-align: center;
                border: 3px solid var(--color-accent-primary);
                flex-shrink: 0;
            }
            
            .navbar-title {
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                font-weight: 700;
                font-size: 24px;
                color: var(--navbar-logo-text);
                text-shadow: var(--text-shadow-effect);
                margin: 0;
                white-space: nowrap;
                pointer-events: none;
                z-index: 1;
                font-family: 'Orbitron', sans-serif;
                text-align: center;
                width: max-content;
            }
            
            .navbar-right-container {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                flex: 0 0 auto;
                margin-left: auto;
                gap: 15px;
            }

            .navbar-notificaciones-container {
                position: relative;
            }
            
            .navbar-notificaciones-btn {
                background: none;
                border: none;
                color: var(--navbar-text);
                font-size: 20px;
                cursor: pointer;
                position: relative;
                padding: 8px;
                border-radius: 50%;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .navbar-notificaciones-btn:hover {
                background-color: var(--color-bg-secondary);
                transform: scale(1.1);
            }
            
            .notificaciones-badge {
                position: absolute;
                top: 0;
                right: 0;
                background-color: #dc3545;
                color: white;
                font-size: 11px;
                font-weight: bold;
                min-width: 18px;
                height: 18px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                border: 2px solid var(--navbar-bg);
            }
            
            .notificaciones-dropdown {
                position: absolute;
                top: 100%;
                right: 0;
                width: 380px;
                background-color: var(--color-bg-primary);
                border-radius: var(--border-radius-medium);
                box-shadow: 0 5px 20px rgba(0,0,0,0.2);
                border: 1px solid var(--color-border-light);
                z-index: 1004;
                display: none;
                margin-top: 10px;
            }
            
            .notificaciones-dropdown.active {
                display: block;
            }
            
            .notificaciones-header {
                padding: 15px;
                border-bottom: 1px solid var(--color-border-light);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .notificaciones-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--color-text-primary);
            }
            
            .notificaciones-marcar-todas {
                background: none;
                border: none;
                color: var(--color-accent-primary);
                font-size: 12px;
                cursor: pointer;
                padding: 5px 10px;
                border-radius: var(--border-radius-small);
                transition: all 0.3s ease;
            }
            
            .notificaciones-marcar-todas:hover {
                background-color: var(--color-bg-secondary);
            }
            
            .notificaciones-lista {
                max-height: 450px;
                overflow-y: auto;
                padding: 10px;
            }
            
            .notificacion-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 12px;
                border-radius: var(--border-radius-small);
                cursor: pointer;
                transition: all 0.3s ease;
                border: 1px solid transparent;
                margin-bottom: 5px;
            }
            
            .notificacion-item.notificacion-evento {
                border-left: 3px solid #e74c3c;
            }
            
            .notificacion-item:hover {
                background-color: var(--color-bg-secondary);
                border-color: var(--color-border-light);
                transform: translateX(-2px);
            }
            
            .notificacion-icono {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                flex-shrink: 0;
            }
            
            .notificacion-contenido {
                flex: 1;
            }
            
            .notificacion-titulo {
                font-weight: 600;
                font-size: 14px;
                color: var(--color-text-primary);
                margin-bottom: 4px;
            }
            
            .notificacion-mensaje {
                font-size: 13px;
                color: var(--color-text-secondary);
                margin-bottom: 4px;
                line-height: 1.4;
            }
            
            .notificacion-detalles {
                display: flex;
                gap: 10px;
                font-size: 11px;
                color: var(--color-text-tertiary);
                margin-bottom: 4px;
                flex-wrap: wrap;
            }
            
            .notificacion-detalles span {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .riesgo-bajo { color: #28a745; }
            .riesgo-medio { color: #ffc107; }
            .riesgo-alto { color: #fd7e14; }
            .riesgo-critico { color: #dc3545; }
            
            .notificacion-tiempo {
                font-size: 10px;
                color: var(--color-text-tertiary);
            }
            
            .notificacion-estado {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                margin-top: 5px;
            }
            
            .notificacion-estado.no-leida {
                background-color: #007bff;
                box-shadow: 0 0 5px #007bff;
            }
            
            .notificacion-estado.leida {
                background-color: transparent;
            }
            
            .notificaciones-vacia,
            .notificaciones-cargando {
                padding: 30px;
                text-align: center;
                color: var(--color-text-secondary);
            }
            
            .notificaciones-vacia i,
            .notificaciones-cargando i {
                font-size: 40px;
                margin-bottom: 10px;
                opacity: 0.5;
            }
            
            .notificaciones-footer, .notificaciones-ver-mas {
                padding: 12px 15px;
                border-top: 1px solid var(--color-border-light);
                text-align: center;
            }
            
            .notificaciones-footer a, .notificaciones-ver-mas a {
                color: var(--color-accent-primary);
                text-decoration: none;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
            }
            
            .notificaciones-footer a:hover, .notificaciones-ver-mas a:hover {
                text-decoration: underline;
            }
            
            .navbar-hamburger-btn {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                background: none;
                border: none;
                cursor: pointer;
                width: 40px;
                height: 40px;
                padding: 0;
                position: relative;
                z-index: 1002;
                transition: var(--transition-default);
                flex-shrink: 0;
            }
            
            .hamburger-line {
                display: block;
                width: 25px;
                height: 3px;
                background-color: var(--navbar-text);
                margin: 3px 0;
                border-radius: var(--border-radius-small);
                transition: var(--transition-default);
            }
            
            .navbar-hamburger-btn.active .hamburger-line:nth-child(1) {
                transform: rotate(45deg) translate(6.3px, 6.3px);
            }
            
            .navbar-hamburger-btn.active .hamburger-line:nth-child(2) {
                opacity: 0;
            }
            
            .navbar-hamburger-btn.active .hamburger-line:nth-child(3) {
                transform: rotate(-45deg) translate(6.3px, -6.3px);
            }
            
            .navbar-main-menu {
                position: fixed;
                top: 0;
                right: -100%;
                width: 25%;
                height: 100vh;
                background-color: var(--navbar-scrolled-bg);
                margin: 0;
                padding: 0 0 30px 0;
                display: flex;
                flex-direction: column;
                transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                z-index: 1001;
                overflow-y: auto;
                box-shadow: -5px 0 15px rgba(0, 0, 0, 0.1);
                visibility: hidden;
                opacity: 0;
                overflow-x: hidden;
                scrollbar-width: none;
                -ms-overflow-style: none;
            }
            
            .navbar-main-menu::-webkit-scrollbar {
                display: none;
                width: 0;
                background: transparent;
            }
            
            .navbar-main-menu.active {
                right: 0;
                visibility: visible;
                opacity: 1;
            }
            
            .admin-profile-section {
                padding: 30px 25px 20px;
                background: linear-gradient(135deg, var(--color-bg-primary) 0%, var(--color-bg-primary) 100%);
                color: var(--color-text-primary);
                border-bottom: 1px solid var(--color-border-light);
                text-align: center;
                position: relative;
            }
            
            .profile-photo-container {
                position: relative;
                width: 120px;
                height: 120px;
                margin: 0 auto 20px;
                display: inline-block;
            }
            
            .admin-profile-circle {
                width: 100%;
                height: 100%;
                border-radius: var(--border-radius-circle);
                overflow: hidden;
                border: 3px solid var(--color-accent-primary);
                background-color: var(--color-bg-secondary);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .admin-profile-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .profile-placeholder {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: var(--color-accent-primary);
                font-size: 40px;
            }

            .profile-placeholder span {
                font-size: 12px;
                margin-top: 5px;
                font-weight: bold;
            }
            
            .edit-profile-icon {
                position: absolute;
                bottom: 5px;
                right: 5px;
                background-color: var(--color-accent-primary);
                width: 35px;
                height: 35px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2);
                cursor: pointer;
                transition: all 0.3s ease;
                border: 2px solid white;
                z-index: 10;
                text-decoration: none;
                color: white;
            }
            
            .edit-profile-icon:hover {
                background-color: var(--color-accent-secondary);
                transform: scale(1.1) rotate(10deg);
                color: white;
            }
            
            .edit-profile-icon i {
                font-size: 14px;
            }
            
            .admin-info {
                margin-bottom: 20px;
            }
            
            .admin-name {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 5px;
                color: var(--color-text-primary);
                font-family: 'Orbitron', sans-serif;
                min-height: 25px;
            }
            
            .admin-role {
                font-size: 14px;
                color: var(--color-text-secondary);
                margin-bottom: 10px;
                font-family: 'Orbitron', sans-serif;
            }
            
            .admin-email {
                font-size: 13px;
                color: var(--color-text-tertiary);
                min-height: 20px;
            }

            .admin-organization {
                font-size: 13px;
                color: var(--color-accent-primary);
                margin-top: 5px;
                font-weight: 600;
            }
            
            .nav-section {
                padding: 10px 15px;
                border-bottom: 1px solid var(--color-border-light);
                overflow-x: hidden;
                max-width: 100%;
                box-sizing: border-box;
            }
            
            .nav-section:last-of-type {
                border-bottom: none;
            }
            
            .nav-section-title {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 15px;
                color: var(--color-text-secondary);
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: 'Orbitron', sans-serif;
            }
            
            .administracion-dropdown-btn,
            .admin-dropdown-btn {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                padding: 14px 16px;
                background-color: var(--color-bg-primary);
                border: 2px solid var(--color-border-medium);
                border-radius: var(--border-radius-medium);
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 16px;
                font-weight: 600;
                color: var(--color-text-primary);
                box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
                font-family: 'Orbitron', sans-serif;
                margin-bottom: 15px;
            }
            
            .administracion-dropdown-btn:hover,
            .admin-dropdown-btn:hover {
                background-color: var(--color-bg-secondary);
                transform: translateY(-2px);
                box-shadow: 0 5px 12px rgba(0, 0, 0, 0.15);
            }
            
            .administracion-dropdown-btn i,
            .admin-dropdown-btn i {
                transition: transform 0.3s ease;
                font-size: 14px;
            }
            
            .administracion-dropdown-btn.active i,
            .admin-dropdown-btn.active i {
                transform: rotate(180deg);
            }
            
            .administracion-dropdown-options,
            .admin-dropdown-options {
                display: none;
                flex-direction: column;
                gap: 10px;
                padding: 15px;
                background-color: var(--color-bg-tertiary);
                border-radius: var(--border-radius-medium);
                border: 1px solid var(--color-border-light);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                margin-bottom: 0;
                width: 100%;
                box-sizing: border-box;
            }
            
            .administracion-dropdown-options.active,
            .admin-dropdown-options.active {
                display: flex;
                opacity: 1;
                overflow: visible;
                margin-bottom: 15px;
                position: static;
                height: auto;
                flex-direction: column;
            }
            
            .administracion-dropdown-option,
            .admin-dropdown-option {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 15px;
                background-color: var(--color-bg-primary);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-small);
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                color: var(--color-text-primary);
                font-weight: 500;
                font-family: 'Orbitron', sans-serif;
                word-break: break-word;
                white-space: normal;
                width: 100%;
                box-sizing: border-box;
            }
            
            .administracion-dropdown-option:hover,
            .admin-dropdown-option:hover {
                background-color: var(--color-bg-secondary);
                transform: translateX(5px);
                box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
            }
            
            .administracion-dropdown-option i,
            .admin-dropdown-option i {
                width: 20px;
                text-align: center;
                font-size: 16px;
                color: var(--color-accent-primary);
                flex-shrink: 0;
            }
            
            .administracion-dropdown-option span,
            .admin-dropdown-option span {
                flex: 1;
                white-space: normal;
                word-break: break-word;
                line-height: 1.4;
            }
            
            .logout-option {
                background: linear-gradient(135deg, #ff6b6b, #ff5252);
                border-color: #ff5252;
                color: white;
            }
            
            .logout-option:hover {
                background: linear-gradient(135deg, #ff5252, #ff3838);
                border-color: #ff3838;
            }
            
            .logout-option i {
                color: white;
            }
            
            .menu-section {
                padding: 20px 25px;
                border-bottom: 1px solid var(--color-border-light);
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .empty-menu-item {
                padding: 10px 15px;
                border-radius: var(--border-radius-small);
                transition: var(--transition-default);
                height: 40px;
                background-color: transparent;
                border: none;
                cursor: default;
            }
            
            .admin-options-section {
                padding: 20px 25px;
                border-top: 1px solid var(--color-border-light);
                margin-top: 0;
                flex-shrink: 0;
            }
            
            .navbar-mobile-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                display: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .navbar-mobile-overlay.active {
                display: block;
                opacity: 1;
            }
            
            .nav-section {
                flex-shrink: 0;
                overflow: visible !important;
            }

            .administracion-dropdown-options,
            .admin-dropdown-options {
                overflow: visible !important;
                max-height: none !important;
                height: auto !important;
            }

            .administracion-dropdown-options.active,
            .admin-dropdown-options.active {
                overflow: visible !important;
                max-height: none !important;
                height: auto !important;
            }

            .navbar-main-menu {
                overflow-y: auto !important;
            }

            .navbar-main-menu * {
                overflow-y: visible !important;
            }
            
            @media (max-width: 992px) {
                .navbar-main-menu {
                    width: 85%;
                }
                
                .logo-circle-container {
                    width: 50px;
                    height: 50px;
                }

                .org-text-logo {
                    width: 50px;
                    height: 50px;
                    font-size: 12px;
                }

                .logo-separator {
                    height: 35px;
                }
                
                .navbar-title {
                    font-size: 22px;
                }

                body.menu-open {
                    overflow: hidden;
                }
                
                .notificaciones-dropdown {
                    width: 340px;
                    right: -50px;
                }
            }
            
            @media (max-width: 768px) {
                .navbar-top-section {
                    padding: 5px 15px;
                }
                
                .navbar-main-menu {
                    width: 100%;
                }

                .logo-circle-container {
                    width: 40px;
                    height: 40px;
                }

                .org-text-logo {
                    width: 40px;
                    height: 40px;
                    font-size: 10px;
                }
                
                .logo-separator {
                    height: 30px;
                    margin: 0 3px;
                }
                
                .navbar-title {
                    font-size: 18px;
                    white-space: normal;
                    max-width: 150px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .profile-photo-container {
                    width: 100px;
                    height: 100px;
                }
                
                .edit-profile-icon {
                    width: 30px;
                    height: 30px;
                }
                
                .admin-dropdown-btn,
                .administracion-dropdown-btn {
                    padding: 12px 14px;
                    font-size: 15px;
                }
                
                .navbar-hamburger-btn {
                    width: 36px;
                    height: 36px;
                }
                
                .hamburger-line {
                    width: 22px;
                    height: 2.5px;
                }
                
                .admin-dropdown-options,
                .administracion-dropdown-options {
                    padding: 12px;
                }
                
                .admin-dropdown-options.active,
                .administracion-dropdown-options.active {
                    max-height: 1500px;
                }
                
                .admin-dropdown-option,
                .administracion-dropdown-option {
                    padding: 14px 12px;
                    gap: 12px;
                }
                
                .admin-dropdown-option i,
                .administracion-dropdown-option i {
                    font-size: 16px;
                    width: 24px;
                }
                
                .admin-dropdown-option span,
                .administracion-dropdown-option span {
                    font-size: 15px;
                    line-height: 1.4;
                }
                
                .nav-section-title {
                    font-size: 15px;
                }
                
                .notificaciones-dropdown {
                    width: 320px;
                    right: -70px;
                }
            }
            
            @media (max-width: 480px) {
                .navbar-top-section {
                    padding: 5px 10px;
                }
                
                .navbar-title {
                    font-size: 16px;
                    max-width: 120px;
                }
                
                .logo-circle-container {
                    width: 36px;
                    height: 36px;
                }
                
                .org-text-logo {
                    width: 36px;
                    height: 36px;
                    font-size: 9px;
                }
                
                .logo-separator {
                    height: 28px;
                    margin: 0 2px;
                }
                
                .navbar-hamburger-btn {
                    width: 32px;
                    height: 32px;
                }
                
                .hamburger-line {
                    width: 20px;
                    height: 2px;
                }
                
                .admin-dropdown-option,
                .administracion-dropdown-option {
                    padding: 12px 10px;
                }
                
                .admin-dropdown-option span,
                .administracion-dropdown-option span {
                    font-size: 14px;
                }
                
                .notificaciones-dropdown {
                    width: 280px;
                    right: -80px;
                }
            }
            
            @media (min-width: 1600px) {
                .navbar-top-section {
                    padding: 5px 40px;
                }
                
                .navbar-title {
                    font-size: 28px;
                }
                
                .logo-circle-container {
                    width: 55px;
                    height: 55px;
                }
                
                .org-text-logo {
                    width: 55px;
                    height: 55px;
                    font-size: 16px;
                }
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = 'navbar-complete-styles';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    insertHTML() {
        const navbar = document.createElement('header');
        navbar.id = 'complete-navbar';
        navbar.innerHTML = /*html*/`
            <div class="navbar-top-section">
                <div class="navbar-left-container">
                    <a href="/usuarios/administrador/panelControl/panelControl.html" class="navbar-logo-link">
                        <div class="logo-circle-container">
                            <img src="/assets/images/logo.png" alt="Centinela Logo" class="navbar-logo-img">
                        </div>
                    </a>

                    <div class="logo-separator"></div>

                    <a href="/usuarios/administrador/panelControl/panelControl.html" class="navbar-logo-link" id="orgLogoLink">
                        <div class="logo-circle-container" id="orgLogoContainer">
                            <img src="/assets/images/logo.png" alt="Logo Organización" 
                                 class="navbar-logo-img" id="orgLogoImg">
                            <div class="org-text-logo" id="orgTextLogo" style="display: none;">ORG</div>
                        </div>
                    </a>
                </div>

                <h1 class="navbar-title">CENTINELA</h1>

                <div class="navbar-right-container">
                    <div class="navbar-notificaciones-container">
                        <button class="navbar-notificaciones-btn" id="notificacionesBtn">
                            <i class="fas fa-bell"></i>
                            <span class="notificaciones-badge" id="notificacionesBadge" style="display: none;">0</span>
                        </button>
                        <div class="notificaciones-dropdown" id="notificacionesDropdown">
                            <div class="notificaciones-header">
                                <h3><i class="fas fa-bell"></i> Notificaciones</h3>
                                <button class="notificaciones-marcar-todas" id="marcarTodasBtn">
                                    <i class="fas fa-check-double"></i> Marcar todas
                                </button>
                            </div>
                            <div class="notificaciones-lista" id="notificacionesLista">
                                <div class="notificaciones-cargando">
                                    <i class="fas fa-spinner fa-spin"></i>
                                    <p>Cargando notificaciones...</p>
                                </div>
                            </div>
                            <div class="notificaciones-footer">
                                <a href="#" class="ver-todas-notificaciones-footer">Ver todas</a>
                            </div>
                        </div>
                    </div>

                    <button class="navbar-hamburger-btn" id="navbarHamburger" aria-label="Toggle menu">
                        <span class="hamburger-line"></span>
                        <span class="hamburger-line"></span>
                        <span class="hamburger-line"></span>
                    </button>
                </div>
            </div>

            <div class="navbar-mobile-overlay" id="navbarMobileOverlay"></div>

            <div class="navbar-main-menu" id="navbarMainMenu">

                <div class="admin-profile-section">
                    <div class="profile-photo-container">
                        <div class="admin-profile-circle">
                            <img src="/assets/images/logo.png" alt="Administrador" class="admin-profile-img" id="adminProfileImg">
                            <div class="profile-placeholder" id="profilePlaceholder" style="display: none;">
                                <i class="fas fa-user"></i>
                                <span>Admin</span>
                            </div>
                        </div>
                        <a href="/usuarios/administrador/editarAdministrador/editarAdministrador.html" class="edit-profile-icon" id="editProfileIcon">
                            <i class="fas fa-pencil-alt"></i>
                        </a>
                    </div>

                    <div class="admin-info">
                        <div class="admin-name" id="adminName">Cargando...</div>
                        <div class="admin-role">Administrador</div>
                        <div class="admin-email" id="adminEmail">cargando@email.com</div>
                        <div class="admin-organization" id="adminOrganization"></div>
                    </div>
                </div>

                <!-- SECCIÓN GESTIONAR (Administración) -->
                <div class="nav-section">
                    <button class="administracion-dropdown-btn" id="administracionDropdownBtn">
                        <span><i class="fa-solid fa-gear"></i> General</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="administracion-dropdown-options" id="administracionDropdownOptions">
                        <a href="/usuarios/administrador/areas/areas.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-map"></i>
                            <span>Áreas</span>
                        </a>
                        <a href="/usuarios/administrador/categorias/categorias.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-tags"></i>
                            <span>Catálogo de Incidencias</span>
                        </a>
                        <a href="/usuarios/administrador/riesgoNivel/riesgoNivel.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-circle-exclamation"></i>
                            <span>Niveles de Riesgo</span>
                        </a>
                        <a href="/usuarios/administrador/sucursales/sucursales.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-store"></i>
                            <span>Sucursales</span>
                        </a>
                        <a href="/usuarios/administrador/regiones/regiones.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-location-dot"></i>
                            <span>Regiones</span>
                        </a>
                        <a href="/usuarios/administrador/permisos/permisos.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-lock"></i>
                            <span>Permisos</span>
                        </a>
                        <a href="/usuarios/administrador/usuarios/usuarios.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-users-gear"></i>
                            <span>Usuarios</span>
                        </a>
                        <a href="/usuarios/administrador/tareas/tareas.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-tasks"></i>
                            <span>Tareas</span>
                        </a>
                    </div>
                </div>

                <!-- SECCIÓN INCIDENCIAS -->
                <div class="nav-section" id="incidenciasSection">
                    <button class="administracion-dropdown-btn" id="incidenciasDropdownBtn">
                        <span><i class="fa-solid fa-exclamation-triangle"></i> Incidencias</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="administracion-dropdown-options" id="incidenciasDropdownOptions">
                        <a href="/usuarios/administrador/incidencias/incidencias.html" class="administracion-dropdown-option incidencia-option" data-permiso-id="listaIncidencias">
                            <i class="fa-solid fa-list"></i>
                            <span>Lista de Incidencias</span>
                        </a>
                        <a href="/usuarios/administrador/crearIncidencias/crearIncidencias.html" class="administracion-dropdown-option incidencia-option" data-permiso-id="crearIncidencias">
                            <i class="fa-solid fa-plus-circle"></i>
                            <span>Crear Incidencia</span>
                        </a>
                        <a href="/usuarios/administrador/incidenciasCanalizadas/incidenciasCanalizadas.html" class="administracion-dropdown-option incidencia-option" data-permiso-id="incidenciasCanalizadas">
                            <i class="fa-solid fa-share-alt"></i>
                            <span>Incidencias Canalizadas</span>
                        </a>
                        
                        <a href="/usuarios/administrador/mercanciaPerdida/mercanciaPerdida.html" class="administracion-dropdown-option incidencia-option" data-permiso-id="listaIncidencias">
                            <i class="fa-solid fa-list"></i>
                            <span>Lista de Recuperaciones</span>
                        </a>
                        <a href="/usuarios/administrador/crearIncidenciasRecuperacion/crearIncidenciasRecuperacion.html" class="administracion-dropdown-option incidencia-option" data-permiso-id="incidenciasCanalizadas">
                            <i class="fa-solid fa-plus-circle"></i>
                            <span>Crear Recuperación</span>
                        </a>
                        <a href="/usuarios/administrador/estadisticas/estadisticas.html" class="administracion-dropdown-option incidencia-option" data-permiso-id="listaIncidencias">
                            <i class="fa-solid fa-chart-bar"></i>
                            <span>Estadisticas</span>
                        </a>
                    </div>
                </div>

                 <!-- SECCIÓN MONITOREO -->
              <div class="nav-section" id="monitoreoSection">
                    <button class="administracion-dropdown-btn" id="monitoreoDropdownBtn">
                        <span><i class="fa-solid fa-map-marker-alt"></i> Monitoreo</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="administracion-dropdown-options" id="monitoreoDropdownOptions">
                        <a href="/usuarios/administrador/mapaAlertas/mapaAlertas.html" class="administracion-dropdown-option">
                              <i class="fa-solid fa-map-location-dot"></i>
                            <span>Mapa de Alertas</span>
                        </a>
                        <a href="/usuarios/administrador/monitoreo/monitoreo.html" class="administracion-dropdown-option">
                            <i class="fa-solid fa-tachometer-alt"></i>
                            <span>Monitoreo de Eventos</span>
                        </a>                                                
                        <a href="/usuarios/administrador/loginMonitoreo/loginMonitoreo.html" class="administracion-dropdown-option">
                            <i class="fas fa-server"></i>
                            <span>Gestión de Paneles</span>
                        </a>
                    </div>
                </div>

                <!-- SECCIÓN BITÁCORA -->
                <div class="nav-section">
                    <div class="nav-section-title">
                        <i class="fa-solid fa-book"></i>
                        <span>Bitácora</span>
                    </div>
                    <a href="/usuarios/administrador/bitacoraActividades/bitacoraActividades.html" class="admin-dropdown-option" style="width: 100%;">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        <span>Bitácora de Actividades</span>
                    </a>
                </div>

                <!-- SECCIÓN CONFIGURACIÓN -->
                <div class="admin-options-section">
                    <button class="admin-dropdown-btn" id="adminDropdownBtn">
                        <span><i class="fa-solid fa-user-gear"></i> Configuración</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="admin-dropdown-options" id="adminDropdownOptions">
                        <a href="#" class="admin-dropdown-option logout-option" id="logoutOption">
                            <i class="fa-solid fa-right-from-bracket"></i>
                            <span>Cerrar Sesión</span>
                        </a>
                    </div>
                </div>
            </div>
        `;
        document.body.prepend(navbar);
    }

    adjustBodyPadding() {
        const navbar = document.getElementById('complete-navbar');
        if (!navbar) return;

        const updatePadding = () => {
            document.body.style.paddingTop = `${navbar.offsetHeight}px`;
        };

        updatePadding();
        const resizeObserver = new ResizeObserver(updatePadding);
        resizeObserver.observe(navbar);
    }

    // ========== CONFIGURACIONES DE DROPDOWNS Y LOGOUT ==========
    setupFunctionalities() {
        this.setupMenu();
        this.setupScroll();
        this.loadFontAwesome();
        this.setupAdminDropdown();
        this.setupAdministracionDropdown();
        this.setupIncidenciasDropdown();
        this.setupMonitoreoDropdown();
        this.loadOrbitronFont();
        this.setupLogout();
        this._configurarNotificacionesDropdown();

        const verTodasFooter = document.querySelector('.ver-todas-notificaciones-footer');
        if (verTodasFooter) {
            verTodasFooter.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._mostrarModalNotificaciones();
            });
        }
    }

    setupMenu() {
        const hamburgerBtn = document.getElementById('navbarHamburger');
        const mainMenu = document.getElementById('navbarMainMenu');
        const overlay = document.getElementById('navbarMobileOverlay');

        if (!hamburgerBtn || !mainMenu || !overlay) return;

        const toggleMenu = () => {
            this.isMenuOpen = !this.isMenuOpen;
            mainMenu.classList.toggle('active', this.isMenuOpen);
            hamburgerBtn.classList.toggle('active', this.isMenuOpen);
            overlay.classList.toggle('active', this.isMenuOpen);
            document.body.classList.toggle('menu-open', this.isMenuOpen);

            if (!this.isMenuOpen) {
                if (this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
                if (this.isAdministracionDropdownOpen) this.toggleAdministracionDropdown(false);
                if (this.isIncidenciasDropdownOpen) this.toggleIncidenciasDropdown(false);
                if (this.isMonitoreoDropdownOpen) this.toggleMonitoreoDropdown(false);
            }
        };

        const closeMenu = () => {
            if (this.isMenuOpen) {
                this.isMenuOpen = false;
                mainMenu.classList.remove('active');
                hamburgerBtn.classList.remove('active');
                overlay.classList.remove('active');
                document.body.classList.remove('menu-open');

                if (this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
                if (this.isAdministracionDropdownOpen) this.toggleAdministracionDropdown(false);
                if (this.isIncidenciasDropdownOpen) this.toggleIncidenciasDropdown(false);
                if (this.isMonitoreoDropdownOpen) this.toggleMonitoreoDropdown(false);
            }
        };

        hamburgerBtn.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', closeMenu);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMenuOpen) closeMenu();
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth > 992 && this.isMenuOpen) closeMenu();
        });
    }

    setupAdminDropdown() {
        const dropdownBtn = document.getElementById('adminDropdownBtn');
        const dropdownOptions = document.getElementById('adminDropdownOptions');
        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isAdministracionDropdownOpen) this.toggleAdministracionDropdown(false);
            if (this.isIncidenciasDropdownOpen) this.toggleIncidenciasDropdown(false);
            if (this.isMonitoreoDropdownOpen) this.toggleMonitoreoDropdown(false);
            this.isAdminDropdownOpen = !this.isAdminDropdownOpen;
            this.toggleAdminDropdown(this.isAdminDropdownOpen);
        };

        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) && !dropdownOptions.contains(e.target) && this.isAdminDropdownOpen) {
                this.toggleAdminDropdown(false);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
        });
    }

    setupAdministracionDropdown() {
        const dropdownBtn = document.getElementById('administracionDropdownBtn');
        const dropdownOptions = document.getElementById('administracionDropdownOptions');
        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isIncidenciasDropdownOpen) this.toggleIncidenciasDropdown(false);
            if (this.isMonitoreoDropdownOpen) this.toggleMonitoreoDropdown(false);
            if (this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
            this.isAdministracionDropdownOpen = !this.isAdministracionDropdownOpen;
            this.toggleAdministracionDropdown(this.isAdministracionDropdownOpen);
        };

        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) && !dropdownOptions.contains(e.target) && this.isAdministracionDropdownOpen) {
                this.toggleAdministracionDropdown(false);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isAdministracionDropdownOpen) this.toggleAdministracionDropdown(false);
        });

        dropdownOptions.querySelectorAll('.administracion-dropdown-option').forEach(option => {
            option.addEventListener('click', () => setTimeout(() => this.toggleAdministracionDropdown(false), 100));
        });
    }

    setupIncidenciasDropdown() {
        const dropdownBtn = document.getElementById('incidenciasDropdownBtn');
        const dropdownOptions = document.getElementById('incidenciasDropdownOptions');
        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isAdministracionDropdownOpen) this.toggleAdministracionDropdown(false);
            if (this.isMonitoreoDropdownOpen) this.toggleMonitoreoDropdown(false);
            if (this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
            this.isIncidenciasDropdownOpen = !this.isIncidenciasDropdownOpen;
            this.toggleIncidenciasDropdown(this.isIncidenciasDropdownOpen);
        };

        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) && !dropdownOptions.contains(e.target) && this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isIncidenciasDropdownOpen) this.toggleIncidenciasDropdown(false);
        });

        dropdownOptions.querySelectorAll('.administracion-dropdown-option').forEach(option => {
            option.addEventListener('click', () => setTimeout(() => this.toggleIncidenciasDropdown(false), 100));
        });
    }

    setupMonitoreoDropdown() {
        const dropdownBtn = document.getElementById('monitoreoDropdownBtn');
        const dropdownOptions = document.getElementById('monitoreoDropdownOptions');
        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isAdministracionDropdownOpen) this.toggleAdministracionDropdown(false);
            if (this.isIncidenciasDropdownOpen) this.toggleIncidenciasDropdown(false);
            if (this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
            this.isMonitoreoDropdownOpen = !this.isMonitoreoDropdownOpen;
            this.toggleMonitoreoDropdown(this.isMonitoreoDropdownOpen);
        };

        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) && !dropdownOptions.contains(e.target) && this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMonitoreoDropdownOpen) this.toggleMonitoreoDropdown(false);
        });

        dropdownOptions.querySelectorAll('.administracion-dropdown-option').forEach(option => {
            option.addEventListener('click', () => setTimeout(() => this.toggleMonitoreoDropdown(false), 100));
        });
    }

    setupLogout() {
        const logoutOption = document.getElementById('logoutOption');
        if (!logoutOption) return;

        logoutOption.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const confirmLogout = await this.showLogoutConfirmation();
            if (confirmLogout) await this.performLogout();
        });
    }

    async showLogoutConfirmation() {
        return new Promise((resolve) => {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: '¿Cerrar sesión?',
                    text: '¿Estás seguro de que deseas salir del sistema?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, cerrar sesión',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    reverseButtons: true
                }).then((result) => resolve(result.isConfirmed));
            } else {
                const confirmed = confirm('¿Estás seguro de que deseas cerrar sesión?');
                resolve(confirmed);
            }
        });
    }

    async performLogout() {
        try {
            if (this.intervalNotificaciones) {
                clearInterval(this.intervalNotificaciones);
                this.intervalNotificaciones = null;
            }

            if (this.userManager && typeof this.userManager.logout === 'function') {
                await this.userManager.logout();
            } else {
                await this.signOutFirebaseDirectly();
            }

            this.clearAllStorage();
            await this.showLogoutSuccessMessage();
            this.redirectToLogin();
        } catch (error) {
            this.clearAllStorage();
            this.redirectToLogin();
        }
    }

    async signOutFirebaseDirectly() {
        try {
            if (typeof firebase !== 'undefined' && firebase.auth) {
                await firebase.auth().signOut();
                return;
            }
            const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js');
            const firebaseApps = typeof firebase !== 'undefined' ? firebase.apps : [];
            if (firebaseApps && firebaseApps.length > 0) {
                const auth = getAuth(firebaseApps[0]);
                await signOut(auth);
            }
        } catch (error) { }
    }

    clearAllStorage() {
        try {
            localStorage.clear();
            sessionStorage.clear();
            this.clearSessionCookies();
            this.clearIndexedDB();
        } catch (error) { }
    }

    clearSessionCookies() {
        try {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i];
                const eqPos = cookie.indexOf('=');
                const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                if (name.includes('session') || name.includes('auth') || name.includes('firebase')) {
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
                }
            }
        } catch (error) { }
    }

    async clearIndexedDB() {
        try {
            const databases = ['firebaseLocalStorageDb', 'firestore', 'centinela-db'];
            for (const dbName of databases) {
                try { await indexedDB.deleteDatabase(dbName); } catch (e) { }
            }
        } catch (error) { }
    }

    async showLogoutSuccessMessage() {
        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                icon: 'success',
                title: 'Sesión cerrada',
                text: 'Has cerrado sesión exitosamente. Redirigiendo...',
                timer: 2000,
                showConfirmButton: false,
                timerProgressBar: true,
                willClose: () => this.redirectToLogin()
            });
        } else {
            alert('Sesión cerrada exitosamente. Redirigiendo...');
        }
    }

    redirectToLogin() {
        const loginUrl = `/index.html`;
        window.location.href = loginUrl;
        setTimeout(() => window.location.replace(loginUrl), 1000);
    }

    toggleAdminDropdown(show) {
        const dropdownBtn = document.getElementById('adminDropdownBtn');
        const dropdownOptions = document.getElementById('adminDropdownOptions');
        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle('active', show);
            dropdownOptions.classList.toggle('active', show);
            this.isAdminDropdownOpen = show;
        }
    }

    toggleAdministracionDropdown(show) {
        const dropdownBtn = document.getElementById('administracionDropdownBtn');
        const dropdownOptions = document.getElementById('administracionDropdownOptions');
        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle('active', show);
            dropdownOptions.classList.toggle('active', show);
            this.isAdministracionDropdownOpen = show;
        }
    }

    toggleIncidenciasDropdown(show) {
        const dropdownBtn = document.getElementById('incidenciasDropdownBtn');
        const dropdownOptions = document.getElementById('incidenciasDropdownOptions');
        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle('active', show);
            dropdownOptions.classList.toggle('active', show);
            this.isIncidenciasDropdownOpen = show;
        }
    }

    toggleMonitoreoDropdown(show) {
        const dropdownBtn = document.getElementById('monitoreoDropdownBtn');
        const dropdownOptions = document.getElementById('monitoreoDropdownOptions');
        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle('active', show);
            dropdownOptions.classList.toggle('active', show);
            this.isMonitoreoDropdownOpen = show;
        }
    }

    setupScroll() {
        const navbar = document.getElementById('complete-navbar');
        if (!navbar) return;
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    loadFontAwesome() {
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
            document.head.appendChild(faLink);
        }
    }

    loadOrbitronFont() {
        if (!document.querySelector('link[href*="orbitron"]')) {
            const orbitronLink = document.createElement('link');
            orbitronLink.rel = 'stylesheet';
            orbitronLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap';
            document.head.appendChild(orbitronLink);
        }
    }
}

new NavbarComplete();