class NavbarComplete {
    constructor() {
        this.isMenuOpen = false;
        this.isGestionarDropdownOpen = false;
        this.isIncidenciasDropdownOpen = false;
        this.isConfiguracionDropdownOpen = false;
        this.isMonitoreoDropdownOpen = false;
        this.currentUser = null;
        this.userRole = null;
        this.permisos = null;
        this.permisoManager = null;
        this.notificacionManager = null;
        this.notificacionesNoLeidas = 0;
        this.notificaciones = [];
        this.dropdownNotificacionesAbierto = false;
        this.intervalNotificaciones = null;

        // Sistema de sonidos
        this.sonidoNotificacion = null;
        this.soundEnabled = true;
        this.soundVolume = 0.7;
        this.availableSounds = [];

        // ========== NUEVO: AtencionEventosManager ==========
        this.atencionEventosManager = null;
        this.esAreaSeguridad = false;

        this.init();
    }

    init() {
        if (window.NavbarCompleteLoaded) {
            return;
        }

        window.NavbarCompleteLoaded = true;

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.setup());
        } else {
            setTimeout(() => this.setup(), 100);
        }
    }

    // navbarColaborador.js – dentro de la clase NavbarComplete
    async setup() {
        try {
            this.removeOriginalNavbar();
            this.createNavbar();
            this.setupFunctionalities();

            // 1. Cargar usuario local y actualizar UI AHORA MISMO
            const usuarioCargado = this.loadUserDataFromLocalStorage();
            if (usuarioCargado) {
                this.updateNavbarWithUserData();  // ← ¡instantáneo!
            }

            // 2. El resto se ejecuta en paralelo sin bloquear la UI del usuario
            window.addEventListener("nuevaNotificacion", (e) => {
                this._cargarNotificaciones(true);
            });

            this._initNotificacionManager().then(() => {
                this._cargarNotificaciones(false);
                this._iniciarListenerNotificaciones();
            });

            Promise.all([
                this.importPermisoManager(),
                this._initSonidoNotificacion(),
                this._initAtencionEventosManager(),
            ]).then(async () => {
                await this.obtenerPermisosReales();
                this.filterMenuByPermissions();
                // Las opciones del menú aparecerán tras calcular permisos
            });

            import("/components/escuchaEventos.js").catch(() => { });
        } catch (error) {
            console.error("Error en setup:", error);
        }
    }

    async _initAtencionEventosManager() {
        try {
            const { AtencionEventosManager } = await import("/components/atencionEventos.js");
            this.atencionEventosManager = new AtencionEventosManager();

            // Esperar a que la inicialización interna termine
            await this.atencionEventosManager.inicializadoPromise;

            this.esAreaSeguridad = this.atencionEventosManager.isActivo();
        } catch (error) {
            console.warn("⚠️ Navbar: No se pudo cargar AtencionEventosManager:", error);
            this.atencionEventosManager = null;
            this.esAreaSeguridad = false;
        }
    }

    // ========== SISTEMA DE SONIDO ==========
    async _initSonidoNotificacion() {
        try {
            const { sonidoNotificacion } =
                await import("/clases/sonidoNotificacion.js");
            this.sonidoNotificacion = sonidoNotificacion;

            await this.sonidoNotificacion.initialize();

            this.availableSounds = this.sonidoNotificacion.getAvailableSounds();

            if (this.currentUser) {
                const deviceId = this._getDeviceId();
                const dispositivoActual = this.currentUser.dispositivos?.find(
                    (d) => d.deviceId === deviceId,
                );

                if (dispositivoActual) {
                    if (dispositivoActual.soundEnabled !== undefined) {
                        this.soundEnabled = dispositivoActual.soundEnabled;
                        this.sonidoNotificacion.setEnabled(this.soundEnabled);
                    }
                    if (dispositivoActual.selectedSound) {
                        localStorage.setItem(
                            "selectedSound",
                            dispositivoActual.selectedSound,
                        );
                    }
                    if (dispositivoActual.soundVolume) {
                        this.soundVolume = dispositivoActual.soundVolume;
                        this.sonidoNotificacion.setGlobalVolume(this.soundVolume);
                        localStorage.setItem("soundVolume", this.soundVolume);
                    }
                } else {
                    const savedSoundEnabled = localStorage.getItem("soundEnabled");
                    if (savedSoundEnabled !== null) {
                        this.soundEnabled = savedSoundEnabled === "true";
                        this.sonidoNotificacion.setEnabled(this.soundEnabled);
                    }
                    const savedVolume = localStorage.getItem("soundVolume");
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
        let deviceId = localStorage.getItem("fcm_device_id");
        if (!deviceId) {
            deviceId =
                "device_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
            localStorage.setItem("fcm_device_id", deviceId);
        }
        return deviceId;
    }

    _determinarSonidoPorNotificacion(notificacion) {
        if (this.sonidoNotificacion) {
            return this.sonidoNotificacion.determinarSonidoParaNotificacion(
                notificacion,
            );
        }

        if (notificacion.esMedicalAlarm || notificacion.typeId === 584)
            return "alarma-medica";
        if (notificacion.esAlarma || notificacion.tipo === "alarma")
            return "alarma-intrusion";
        if (notificacion.nivelRiesgo === "critico") return "alarma-intrusion";
        if (
            notificacion.tipo === "incidencia" ||
            notificacion.tipo === "canalizacion"
        )
            return "nueva-incidencia";
        if (
            notificacion.tipo === "seguimiento" ||
            notificacion.tipo === "actualizacion" ||
            notificacion.tipo === "comentario"
        ) {
            return "nuevo-seguimiento";
        }

        return "notificacion-general";
    }

    async _reproducirSonido(notificacion) {
        if (!this.soundEnabled || !this.sonidoNotificacion) return;

        try {
            // Usar el sistema de cola (uno a la vez, sin bucles)
            await this.sonidoNotificacion.playForNotificacion(
                notificacion,
                this.soundVolume,
            );
        } catch (error) {
            console.debug("Error reproduciendo sonido:", error);
        }
    }

    async _detectarYReproducirSonido(nuevasNotificaciones) {
        if (!this.soundEnabled || !this.sonidoNotificacion) return;

        const nuevasNoLeidas = nuevasNotificaciones.filter((n) => !n.leida);

        if (nuevasNoLeidas.length > 0) {
            const primeraNotificacion = nuevasNoLeidas[0];
            await this._reproducirSonido(primeraNotificacion);

            if (
                Notification.permission === "granted" &&
                nuevasNoLeidas.length === 1
            ) {
                const primera = nuevasNoLeidas[0];
                const notifUI = primera.toUI
                    ? primera.toUI()
                    : {
                        titulo: primera.titulo,
                        mensaje: primera.mensaje,
                    };

                const systemNotif = new Notification(notifUI.titulo, {
                    body: notifUI.mensaje,
                    icon: "/assets/images/logo.png",
                    badge: "/assets/images/logo.png",
                    silent: false,
                    vibrate: [200, 100, 200],
                });

                systemNotif.onclick = () => {
                    window.focus();
                    if (primera.urlDestino && primera.urlDestino !== "#") {
                        window.location.href = primera.urlDestino;
                    }
                    systemNotif.close();
                };
            } else if (
                Notification.permission === "granted" &&
                nuevasNoLeidas.length > 1
            ) {
                const systemNotif = new Notification(
                    `📬 ${nuevasNoLeidas.length} nuevas notificaciones`,
                    {
                        body: `Tienes ${nuevasNoLeidas.length} notificaciones sin leer`,
                        icon: "/assets/images/logo.png",
                        badge: "/assets/images/logo.png",
                        silent: false,
                    },
                );

                systemNotif.onclick = () => {
                    window.focus();
                    this._mostrarModalNotificaciones();
                    systemNotif.close();
                };
            }
        }
    }

    async _initNotificacionManager() {
        try {
            const { NotificacionAreaManager } =
                await import("/clases/notificacionArea.js");
            this.notificacionManager = new NotificacionAreaManager();
            // No necesitamos await aquí, el constructor es síncrono
        } catch (error) {
            console.warn("Error cargando NotificacionAreaManager:", error);
        }
    }

    async _cargarNotificaciones(forzarSonido = false, conteoPrevio = null) {
        if (!this.notificacionManager || !this.currentUser?.id || !this.currentUser?.organizacionCamelCase) {
            return;
        }

        try {
            const promesas = [
                conteoPrevio !== null ? Promise.resolve(conteoPrevio) :
                    this.notificacionManager.obtenerConteoNoLeidas(
                        this.currentUser.id,
                        this.currentUser.organizacionCamelCase
                    ),
                this.notificacionManager.obtenerNotificacionesPaginadas(
                    this.currentUser.id,
                    this.currentUser.organizacionCamelCase,
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

            // Solo sonido para notificaciones realmente nuevas y recientes
            const notificacionesExistentesIds = new Set(this.notificaciones.map(n => n.id));
            const nuevasNoLeidas = notificaciones.filter(n =>
                !n.leida && !notificacionesExistentesIds.has(n.id)
            );

            // Verificar que sean eventos recientes (últimos 30 segundos)
            const ahora = new Date();
            const realmenteNuevas = nuevasNoLeidas.filter(n => {
                const fechaNotificacion = n.fecha || new Date(0);
                const diffSegundos = (ahora - fechaNotificacion) / 1000;
                return diffSegundos < 30;
            });

            // Reproducir sonido SOLO para notificaciones realmente nuevas
            if (realmenteNuevas.length > 0 && forzarSonido === true) {
                this._reproducirSonidosEnBackground(realmenteNuevas);
                this._mostrarNotificacionSistema(realmenteNuevas);
            }

            this.notificaciones = notificaciones;
            this._renderizarNotificaciones();

        } catch (error) {
            console.error('❌ Error cargando notificaciones:', error);
        }
    }

    // Nuevo método helper para no bloquear
    async _reproducirSonidosEnBackground(notificaciones) {
        for (const notif of notificaciones) {
            await this._reproducirSonido(notif);
            await new Promise((r) => setTimeout(r, 300));
        }
    }

    _iniciarListenerNotificaciones() {
        if (!this.notificacionManager || !this.currentUser?.id || !this.currentUser?.organizacionCamelCase) {
            return;
        }

        if (this.intervalNotificaciones) {
            clearInterval(this.intervalNotificaciones);
        }

        // ========== Intervalo de 2 segundos para mayor reactividad ==========
        this.intervalNotificaciones = setInterval(async () => {
            try {
                const nuevoConteo = await this.notificacionManager.obtenerConteoNoLeidas(
                    this.currentUser.id,
                    this.currentUser.organizacionCamelCase
                );

                // Si cambió el conteo, recargar pasando el conteo ya conocido
                if (nuevoConteo !== this.notificacionesNoLeidas) {
                    await this._cargarNotificaciones(true, nuevoConteo);
                }
            } catch (error) {
                // Error silencioso
            }
        }, 2000); // 2 segundos en lugar de 3
    }

    _renderizarNotificaciones() {
        const container = document.getElementById("notificacionesLista");
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

        let html = "";

        this.notificaciones.forEach((notif) => {
            const notifUI = notif.toUI ? notif.toUI() : {
                titulo: notif.titulo,
                mensaje: notif.mensaje,
                icono: notif.getIcono ? notif.getIcono() : "fa-bell",
                color: notif.getColor ? notif.getColor() : "#007bff",
                sucursalNombre: notif.sucursalNombre,
                nivelRiesgo: notif.nivelRiesgo,
                tiempoRelativo: notif.getTiempoRelativo ? notif.getTiempoRelativo() : "",
                urlDestino: notif.urlDestino || (notif.incidenciaId ? `../verIncidencias/verIncidencias.html?id=${notif.incidenciaId}` : "#"),
                leida: notif.leida || false,
                esEvento: this._esNotificacionEvento(notif),
                eventId: notif.eventId || notif.detalles?.eventId,
                estadoEvento: notif.estadoEvento || 'pendiente',
                nombreUsuarioAtencion: notif.nombreUsuarioAtencion || null,
                mensajeRespuesta: notif.mensajeRespuesta || null
            };

            const eventoClass = notifUI.esEvento ? "notificacion-evento" : "";
            const eventoIconoAdicional = notifUI.esEvento ?
                (notif.esMedicalAlarm ? "" : (notif.esAlarma ? "" : "")) : "";

            // Badge de estado
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
            <div class="notificacion-item ${eventoClass}" data-id="${notif.id}" data-url="${notifUI.urlDestino}" data-es-evento="${notifUI.esEvento}" data-event-id="${notifUI.eventId || ""}" data-estado="${notifUI.estadoEvento}">
                <div class="notificacion-icono" style="background-color: ${estadoColor || notifUI.color}20; color: ${estadoColor || notifUI.color}">
                    <i class="fas ${notifUI.icono}"></i>
                </div>
                <div class="notificacion-contenido">
                    <div class="notificacion-titulo">
                        ${eventoIconoAdicional} ${this._escapeHTML(notifUI.titulo)}
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
                        ${notifUI.sucursalNombre ? `<span><i class="fas fa-store"></i> ${this._escapeHTML(notifUI.sucursalNombre)}</span>` : ""}
                        ${notifUI.nivelRiesgo ? `<span class="riesgo-${notifUI.nivelRiesgo}"><i class="fas fa-exclamation-triangle"></i> ${notifUI.nivelRiesgo}</span>` : ""}
                        ${notif.panelAlias ? `<span><i class="fas fa-microchip"></i> ${this._escapeHTML(notif.panelAlias)}</span>` : ""}
                    </div>
                    <div class="notificacion-tiempo">${this._escapeHTML(notifUI.tiempoRelativo)}</div>
                </div>
                <div class="notificacion-estado ${notifUI.leida ? "leida" : "no-leida"}"></div>
            </div>
        `;
        });

        html += `
        <div class="notificaciones-ver-mas">
            <a href="#" class="ver-todas-notificaciones">Ver todas las notificaciones</a>
        </div>
    `;

        container.innerHTML = html;

        // ========== Eventos de clic ==========
        container.querySelectorAll('.notificacion-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = item.dataset.id;
                const url = item.dataset.url;
                const esEvento = item.dataset.esEvento === "true";

                const notificacion = this.notificaciones.find(n => n.id === id);
                if (!notificacion) return;

                // Si es evento, manejar con atención de eventos
                if (esEvento || this._esNotificacionEvento(notificacion)) {
                    e.preventDefault();
                    await this._manejarClicNotificacionEvento(notificacion, item);
                    return;
                }

                // Para incidencias/canalizaciones
                if (this.notificacionManager && id) {
                    await this.notificacionManager.marcarComoLeida(
                        this.currentUser.id,
                        id,
                        this.currentUser.organizacionCamelCase
                    );

                    // ===== ELIMINAR LOCALMENTE =====
                    const notifIndex = this.notificaciones.findIndex(n => n.id === id);
                    if (notifIndex !== -1) {
                        this.notificaciones.splice(notifIndex, 1);
                    }

                    // Actualizar contador y vista
                    this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                    this._actualizarBadgeNotificaciones();
                    this._renderizarNotificaciones();  // re-renderiza el dropdown al instante

                    if (url && url !== '#') {
                        window.location.href = url;
                    }
                }
            });
        });

        // Configurar "Ver todas"
        const verTodasLink = container.querySelector(".ver-todas-notificaciones");
        if (verTodasLink) {
            verTodasLink.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._mostrarModalNotificaciones();
            });
        }
    }

    async _marcarTodasLeidas() {
        if (
            !this.notificacionManager ||
            !this.currentUser?.id ||
            !this.currentUser?.organizacionCamelCase
        ) {
            return;
        }

        try {
            await this.notificacionManager.marcarTodasComoLeidas(
                this.currentUser.id,
                this.currentUser.organizacionCamelCase,
            );

            // Limpiar arreglo local completamente
            this.notificaciones = [];
            this.notificacionesNoLeidas = 0;

            this._actualizarBadgeNotificaciones();
            this._renderizarNotificaciones();
        } catch (error) {
            console.error("❌ Error marcando todas leídas:", error);
        }
    }

    // ========== SIMPLIFICAR recargarNotificacionesManual ==========
    async recargarNotificacionesManual() {
        await this._cargarNotificaciones(false);
    }

    _actualizarBadgeNotificaciones() {
        const badge = document.getElementById("notificacionesBadge");
        if (!badge) return;

        if (this.notificacionesNoLeidas > 0) {
            badge.textContent =
                this.notificacionesNoLeidas > 99 ? "99+" : this.notificacionesNoLeidas;
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    }

    _esNotificacionEvento(notificacion) {
        // Verificar por tipo
        if (
            notificacion.tipo === "evento_monitoreo" ||
            notificacion.tipo === "alarma" ||
            notificacion.tipo === "monitoreo"
        ) {
            return true;
        }

        // Verificar por detalles
        const detalles = notificacion.detalles || {};
        if (detalles.eventId || detalles.panel_serial || detalles.type_id) {
            return true;
        }

        // Verificar por campos directos
        if (notificacion.eventId || notificacion.panelSerial || notificacion.typeId) {
            return true;
        }

        return false;
    }

    async _manejarClicNotificacionEvento(notificacion, elementoHTML) {
        try {
            const estado = notificacion.estadoEvento || (notificacion.detalles?.estadoEvento) || 'pendiente';

            // ===== CASO: Evento ya atendido/ignorado =====
            if (estado !== 'pendiente') {
                // Marcar como leída (esto además limpia usuariosIds gracias a la corrección en notificacionArea)
                if (this.notificacionManager && notificacion.id) {
                    await this.notificacionManager.marcarComoLeida(
                        this.currentUser.id,
                        notificacion.id,
                        this.currentUser.organizacionCamelCase
                    );
                }

                // Eliminar localmente
                const index = this.notificaciones.findIndex(n => n.id === notificacion.id);
                if (index !== -1) this.notificaciones.splice(index, 1);

                this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                this._actualizarBadgeNotificaciones();
                this._renderizarNotificaciones();   // <-- ACTUALIZA INMEDIATAMENTE

                // Emitir evento para que monitoreo actualice (solo si está resuelto)
                window.dispatchEvent(new CustomEvent('eventoActualizado', {
                    detail: {
                        eventoId: notificacion.eventId || notificacion.detalles?.eventId,
                        estadoEvento: estado
                    }
                }));

                this.dropdownNotificacionesAbierto = false;
                document.getElementById("notificacionesDropdown")?.classList.remove("active");
                return;
            }

            // ===== CASO: Evento pendiente y usuario SÍ es área de seguridad =====
            if (this.atencionEventosManager && this.esAreaSeguridad) {
                if (elementoHTML) {
                    elementoHTML.style.opacity = "0.7";
                    elementoHTML.style.pointerEvents = "none";
                }

                const resultado = await this.atencionEventosManager.procesarNotificacionEvento(notificacion);

                if (resultado) {
                    // Marcar como leída y eliminar localmente
                    if (this.notificacionManager && notificacion.id) {
                        await this.notificacionManager.marcarComoLeida(
                            this.currentUser.id,
                            notificacion.id,
                            this.currentUser.organizacionCamelCase
                        );
                    }

                    const index = this.notificaciones.findIndex(n => n.id === notificacion.id);
                    if (index !== -1) this.notificaciones.splice(index, 1);

                    this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                    this._actualizarBadgeNotificaciones();
                    this._renderizarNotificaciones();   // <-- actualiza

                    // Emitir evento para que monitoreo se actualice
                    window.dispatchEvent(new CustomEvent('eventoActualizado', {
                        detail: {
                            eventoId: notificacion.eventId || notificacion.detalles?.eventId,
                            estadoEvento: resultado.accion // 'atendido' o 'ignorado'
                        }
                    }));

                    this.dropdownNotificacionesAbierto = false;
                    document.getElementById("notificacionesDropdown")?.classList.remove("active");
                }

                if (elementoHTML) {
                    elementoHTML.style.opacity = "1";
                    elementoHTML.style.pointerEvents = "auto";
                }
            }
            // ===== CASO: Usuario NO seguridad – solo lectura =====
            else {
                await this._mostrarInfoEventoSoloLectura(notificacion);

                if (this.notificacionManager && notificacion.id) {
                    await this.notificacionManager.marcarComoLeida(
                        this.currentUser.id,
                        notificacion.id,
                        this.currentUser.organizacionCamelCase
                    );
                }

                const index = this.notificaciones.findIndex(n => n.id === notificacion.id);
                if (index !== -1) this.notificaciones.splice(index, 1);

                this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                this._actualizarBadgeNotificaciones();
                this._renderizarNotificaciones();   // <-- actualiza

                // Emitir evento para mantener sincronizado el monitoreo
                window.dispatchEvent(new CustomEvent('eventoActualizado', {
                    detail: {
                        eventoId: notificacion.eventId || notificacion.detalles?.eventId,
                        estadoEvento: notificacion.estadoEvento || 'pendiente'
                    }
                }));

                this.dropdownNotificacionesAbierto = false;
                document.getElementById("notificacionesDropdown")?.classList.remove("active");
            }
        } catch (error) {
            console.error("Error:", error);
            if (elementoHTML) {
                elementoHTML.style.opacity = "1";
                elementoHTML.style.pointerEvents = "auto";
            }
        }
    }

    // ========== REEMPLAZAR EN navbarColaborador.js ==========
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
                    <div style="margin-top: 20px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: center; color: #888;">
                        <i class="fas fa-info-circle"></i> Solo los usuarios del área de Seguridad pueden atender eventos
                    </div>
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
            Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar la información del evento", background: "#1a1a2e", color: "#ffffff" });
        }
    }

    // ========== REEMPLAZAR COMPLETAMENTE EL MÉTODO _mostrarModalNotificaciones ==========
    _mostrarModalNotificaciones() {
        if (typeof Swal === "undefined") {
            window.location.href = "#";
            return;
        }

        this.modalNotificacionesState = {
            paginaActual: 1,
            itemsPorPagina: 10,
            totalPaginas: 0,
            totalNotificaciones: 0,
            filtros: {
                tipo: "todos",
                nivelRiesgo: "todos",
                subtipoEvento: "todos",
            },
        };

        const self = this;

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
                    self.currentUser.id,
                    self.currentUser.organizacionCamelCase,
                    {
                        filtros: state.filtros,
                        pagina: state.paginaActual,
                        itemsPorPagina: state.itemsPorPagina,
                    },
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

                    notificaciones.forEach((notif) => {
                        const notifUI = notif.toUI ? notif.toUI() : {
                            titulo: notif.titulo, mensaje: notif.mensaje,
                            icono: notif.getIcono ? notif.getIcono() : "fa-bell",
                            color: notif.getColor ? notif.getColor() : "#007bff",
                            tiempoRelativo: notif.getTiempoRelativo ? notif.getTiempoRelativo() : "",
                            urlDestino: notif.urlDestino || (notif.incidenciaId ? `../verIncidencias/verIncidencias.html?id=${notif.incidenciaId}` : "#"),
                            leida: notif.leida || false,
                            esEvento: self._esNotificacionEvento(notif),
                        };

                        const eventoIcono = notifUI.esEvento ? (notif.esMedicalAlarm ? "" : (notif.esAlarma ? "" : "")) : "";
                        const estadoEvento = notif.estadoEvento || (notif.detalles?.estadoEvento) || 'pendiente';
                        const esEventoPendiente = notifUI.esEvento && estadoEvento === 'pendiente';

                        notificacionesHtml += `
                        <div class="notificacion-item-modal" data-id="${notif.id}" data-url="${notifUI.urlDestino}" data-es-evento="${notifUI.esEvento}" data-estado="${estadoEvento}" data-event-id="${notif.eventId || notif.detalles?.eventId || ''}" style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-bottom: 1px solid #333; cursor: pointer; background: ${notifUI.leida ? 'transparent' : 'rgba(0, 207, 255, 0.05)'};">
                            <div class="notificacion-icono" style="width: 40px; height: 40px; border-radius: 50%; background-color: ${notifUI.color}20; color: ${notifUI.color}; display: flex; align-items: center; justify-content: center;">
                                <i class="fas ${notifUI.icono}"></i>
                            </div>
                            <div style="flex: 1;">
                                <div style="font-weight: 600; margin-bottom: 4px;">${eventoIcono} ${self._escapeHTML(notifUI.titulo)}</div>
                                <div style="font-size: 13px; color: #aaa; margin-bottom: 4px;">${self._escapeHTML(notifUI.mensaje)}</div>
                                ${notif.nombreUsuarioAtencion ? `<div style="font-size: 11px; color: #888; margin-bottom: 4px;"><i class="fas fa-user-check"></i> ${self._escapeHTML(notif.nombreUsuarioAtencion)}${notif.mensajeRespuesta ? `: "${self._escapeHTML(notif.mensajeRespuesta)}"` : ''}</div>` : ''}
                                <div style="font-size: 11px; color: #666;">${self._escapeHTML(notifUI.tiempoRelativo)}</div>
                                ${esEventoPendiente ? `
                                <div style="margin-top: 10px; display: flex; gap: 8px;">
                                    <button class="modal-btn-atender" data-id="${notif.id}" data-event-id="${notif.eventId || notif.detalles?.eventId || ''}" style="background: #2ecc71; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 5px;"><i class="fas fa-check-circle"></i> Atender</button>
                                    <button class="modal-btn-ignorar" data-id="${notif.id}" data-event-id="${notif.eventId || notif.detalles?.eventId || ''}" style="background: #95a5a6; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 5px;"><i class="fas fa-ban"></i> Ignorar</button>
                                </div>
                                ` : ''}
                                ${estadoEvento === 'atendido' ? `<div style="margin-top: 8px; padding: 4px 8px; background: rgba(46, 204, 113, 0.2); border-radius: 4px; font-size: 11px; color: #2ecc71;"><i class="fas fa-check-circle"></i> Atendido${notif.nombreUsuarioAtencion ? ` por ${self._escapeHTML(notif.nombreUsuarioAtencion)}` : ''}</div>` : ''}
                                ${estadoEvento === 'ignorado' ? `<div style="margin-top: 8px; padding: 4px 8px; background: rgba(149, 165, 166, 0.2); border-radius: 4px; font-size: 11px; color: #95a5a6;"><i class="fas fa-ban"></i> Ignorado</div>` : ''}
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
                didOpen: async () => {
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
                        const { notificacionesHtml: nuevasNotificaciones, paginacionHtml: nuevaPaginacion } = await renderizarContenidoModal(self.modalNotificacionesState);
                        document.getElementById("modalNotificacionesLista").innerHTML = nuevasNotificaciones;
                        document.getElementById("modalNotificacionesPaginacion").innerHTML = nuevaPaginacion;
                        configurarEventListeners();
                    };

                    if (filtroTipo) { filtroTipo.addEventListener("change", () => { actualizarFiltroSecundario(); aplicarFiltros(); }); }
                    if (filtroSecundario) { filtroSecundario.addEventListener("change", aplicarFiltros); }

                    const configurarEventListeners = () => {
                        document.querySelectorAll(".notificacion-item-modal").forEach((item) => {
                            item.addEventListener("click", async (e) => {
                                if (e.target.closest(".modal-btn-atender") || e.target.closest(".modal-btn-ignorar")) return;
                                e.stopPropagation();
                                const id = item.dataset.id;
                                const url = item.dataset.url;
                                const esEvento = item.dataset.esEvento === "true";
                                const estado = item.dataset.estado || 'pendiente';
                                const notificacion = self.modalNotificacionesState.notificaciones?.find((n) => n.id === id);
                                if (!notificacion) return;

                                if (esEvento || self._esNotificacionEvento(notificacion)) {
                                    Swal.close();
                                    if (estado === 'pendiente' && self.atencionEventosManager && self.esAreaSeguridad) {
                                        const resultado = await self.atencionEventosManager.procesarNotificacionEvento(notificacion);
                                        if (resultado) {
                                            if (self.notificacionManager && id) await self.notificacionManager.marcarComoLeida(self.currentUser.id, id, self.currentUser.organizacionCamelCase);
                                            const index = self.notificaciones.findIndex(n => n.id === id);
                                            if (index !== -1) self.notificaciones.splice(index, 1);
                                            self.notificacionesNoLeidas = self.notificaciones.filter(n => !n.leida).length;
                                            self._actualizarBadgeNotificaciones();
                                            self._renderizarNotificaciones();
                                        }
                                    } else {
                                        await self._mostrarInfoEventoSoloLectura(notificacion);
                                        if (self.notificacionManager && id) await self.notificacionManager.marcarComoLeida(self.currentUser.id, id, self.currentUser.organizacionCamelCase);
                                        const index = self.notificaciones.findIndex(n => n.id === id);
                                        if (index !== -1) self.notificaciones.splice(index, 1);
                                        self.notificacionesNoLeidas = self.notificaciones.filter(n => !n.leida).length;
                                        self._actualizarBadgeNotificaciones();
                                        self._renderizarNotificaciones();
                                    }
                                    return;
                                }

                                if (self.notificacionManager && id) await self.notificacionManager.marcarComoLeida(self.currentUser.id, id, self.currentUser.organizacionCamelCase);
                                const index = self.notificaciones.findIndex(n => n.id === id);
                                if (index !== -1) self.notificaciones.splice(index, 1);
                                self.notificacionesNoLeidas = self.notificaciones.filter(n => !n.leida).length;
                                self._actualizarBadgeNotificaciones();
                                self._renderizarNotificaciones();
                                if (url && url !== "#") window.location.href = url;
                                Swal.close();
                            });
                        });

                        document.querySelectorAll(".modal-btn-atender").forEach((btn) => {
                            btn.addEventListener("click", async (e) => {
                                e.stopPropagation(); e.preventDefault();
                                const notificacionId = btn.dataset.id;
                                const notificacion = self.notificaciones.find((n) => n.id === notificacionId);
                                if (!notificacion) return;
                                Swal.close();
                                if (self.atencionEventosManager && self.esAreaSeguridad) {
                                    const resultado = await self.atencionEventosManager.procesarNotificacionEvento(notificacion);
                                    if (resultado) {
                                        if (self.notificacionManager && notificacionId) await self.notificacionManager.marcarComoLeida(self.currentUser.id, notificacionId, self.currentUser.organizacionCamelCase);
                                        const index = self.notificaciones.findIndex(n => n.id === notificacionId);
                                        if (index !== -1) self.notificaciones.splice(index, 1);
                                        self.notificacionesNoLeidas = self.notificaciones.filter(n => !n.leida).length;
                                        self._actualizarBadgeNotificaciones();
                                        self._renderizarNotificaciones();
                                    }
                                }
                            });
                        });

                        document.querySelectorAll(".modal-btn-ignorar").forEach((btn) => {
                            btn.addEventListener("click", async (e) => {
                                e.stopPropagation(); e.preventDefault();
                                const notificacionId = btn.dataset.id;
                                const notificacion = self.notificaciones.find((n) => n.id === notificacionId);
                                if (!notificacion) return;
                                Swal.close();
                                if (self.atencionEventosManager && self.esAreaSeguridad) {
                                    const resultado = await self.atencionEventosManager.procesarNotificacionEvento(notificacion);
                                    if (resultado) {
                                        if (self.notificacionManager && notificacionId) await self.notificacionManager.marcarComoLeida(self.currentUser.id, notificacionId, self.currentUser.organizacionCamelCase);
                                        const index = self.notificaciones.findIndex(n => n.id === notificacionId);
                                        if (index !== -1) self.notificaciones.splice(index, 1);
                                        self.notificacionesNoLeidas = self.notificaciones.filter(n => !n.leida).length;
                                        self._actualizarBadgeNotificaciones();
                                        self._renderizarNotificaciones();
                                    }
                                }
                            });
                        });

                        const btnAnterior = document.getElementById("modalPaginaAnterior");
                        const btnSiguiente = document.getElementById("modalPaginaSiguiente");
                        if (btnAnterior) btnAnterior.addEventListener("click", async () => {
                            if (self.modalNotificacionesState.paginaActual > 1) {
                                self.modalNotificacionesState.paginaActual--;
                                const { notificacionesHtml: nuevasNotificaciones, paginacionHtml: nuevaPaginacion } = await renderizarContenidoModal(self.modalNotificacionesState);
                                document.getElementById("modalNotificacionesLista").innerHTML = nuevasNotificaciones;
                                document.getElementById("modalNotificacionesPaginacion").innerHTML = nuevaPaginacion;
                                configurarEventListeners();
                            }
                        });
                        if (btnSiguiente) btnSiguiente.addEventListener("click", async () => {
                            if (self.modalNotificacionesState.paginaActual < self.modalNotificacionesState.totalPaginas) {
                                self.modalNotificacionesState.paginaActual++;
                                const { notificacionesHtml: nuevasNotificaciones, paginacionHtml: nuevaPaginacion } = await renderizarContenidoModal(self.modalNotificacionesState);
                                document.getElementById("modalNotificacionesLista").innerHTML = nuevasNotificaciones;
                                document.getElementById("modalNotificacionesPaginacion").innerHTML = nuevaPaginacion;
                                configurarEventListeners();
                            }
                        });
                    };
                    configurarEventListeners();
                },
            });
        });
    }

    async _mostrarModalAtencionManual(notificacion) {
        try {
            const { Evento } = await import('/clases/evento.js');

            const eventId = notificacion.eventId || notificacion.detalles?.eventId;
            if (!eventId) throw new Error('No se encontró el ID del evento');

            Swal.showLoading();
            const evento = await Evento.obtenerPorId(eventId);
            if (!evento) throw new Error('No se pudo cargar el evento');

            const { value: mensaje } = await Swal.fire({
                title: 'Atender Evento',
                html: `
                <div style="text-align: left;">
                    <p><strong>${this._escapeHTML(evento.description || 'Evento')}</strong></p>
                    <p>Panel: ${this._escapeHTML(evento.panel_alias || evento.panel_serial)}</p>
                    <textarea id="mensajeRespuesta" rows="3" style="width:100%; padding:12px; background:rgba(0,0,0,0.3); border:1px solid #444; border-radius:8px; color:white; margin-top:15px;" placeholder="Mensaje de respuesta (opcional)"></textarea>
                </div>
            `,
                showCancelButton: true,
                confirmButtonText: 'Atender',
                confirmButtonColor: '#2ecc71',
                cancelButtonText: 'Cancelar',
                background: '#1a1a2e',
                color: '#ffffff',
                preConfirm: () => document.getElementById('mensajeRespuesta')?.value || ''
            });

            if (mensaje !== undefined) {
                Swal.showLoading();
                await evento.marcarComoAtendido(this.currentUser.id, this.currentUser.nombreCompleto, mensaje);

                // Marcar notificación como leída
                if (this.notificacionManager && notificacion.id) {
                    await this.notificacionManager.marcarComoLeida(
                        this.currentUser.id, notificacion.id, this.currentUser.organizacionCamelCase
                    );
                }

                Swal.fire({
                    icon: 'success',
                    title: '¡Evento atendido!',
                    timer: 1500,
                    showConfirmButton: false,
                    background: '#1a1a2e',
                    color: '#ffffff'
                });

                // Eliminar de la lista local y recargar
                const index = this.notificaciones.findIndex(n => n.id === notificacion.id);
                if (index !== -1) {
                    this.notificaciones.splice(index, 1);
                }
                this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                this._actualizarBadgeNotificaciones();
                this._renderizarNotificaciones();
            }

        } catch (error) {
            console.error('❌ Error:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: error.message, background: '#1a1a2e', color: '#ffffff' });
        }
    }

    async _mostrarModalIgnorarManual(notificacion) {
        try {
            const { Evento } = await import('/clases/evento.js');

            const eventId = notificacion.eventId || notificacion.detalles?.eventId;
            if (!eventId) throw new Error('No se encontró el ID del evento');

            Swal.showLoading();
            const evento = await Evento.obtenerPorId(eventId);
            if (!evento) throw new Error('No se pudo cargar el evento');

            const { value: motivo } = await Swal.fire({
                title: 'Ignorar Evento',
                html: `
                <div style="text-align: left;">
                    <p><strong>${this._escapeHTML(evento.description || 'Evento')}</strong></p>
                    <p>Panel: ${this._escapeHTML(evento.panel_alias || evento.panel_serial)}</p>
                    <input id="motivoIgnorar" type="text" style="width:100%; padding:12px; background:rgba(0,0,0,0.3); border:1px solid #444; border-radius:8px; color:white; margin-top:15px;" placeholder="Motivo (opcional)">
                </div>
            `,
                showCancelButton: true,
                confirmButtonText: 'Ignorar',
                confirmButtonColor: '#95a5a6',
                cancelButtonText: 'Cancelar',
                background: '#1a1a2e',
                color: '#ffffff',
                preConfirm: () => document.getElementById('motivoIgnorar')?.value || 'Evento ignorado'
            });

            if (motivo !== undefined) {
                Swal.showLoading();
                await evento.marcarComoIgnorado(this.currentUser.id, this.currentUser.nombreCompleto, motivo);

                // Marcar notificación como leída
                if (this.notificacionManager && notificacion.id) {
                    await this.notificacionManager.marcarComoLeida(
                        this.currentUser.id, notificacion.id, this.currentUser.organizacionCamelCase
                    );
                }

                Swal.fire({
                    icon: 'success',
                    title: 'Evento ignorado',
                    timer: 1500,
                    showConfirmButton: false,
                    background: '#1a1a2e',
                    color: '#ffffff'
                });

                // Eliminar de la lista local
                const index = this.notificaciones.findIndex(n => n.id === notificacion.id);
                if (index !== -1) {
                    this.notificaciones.splice(index, 1);
                }
                this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                this._actualizarBadgeNotificaciones();
                this._renderizarNotificaciones();
            }

        } catch (error) {
            console.error('❌ Error:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: error.message, background: '#1a1a2e', color: '#ffffff' });
        }
    }

    _escapeHTML(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    _configurarNotificacionesDropdown() {
        const notificacionesBtn = document.getElementById("notificacionesBtn");
        const notificacionesDropdown = document.getElementById(
            "notificacionesDropdown",
        );
        const marcarTodasBtn = document.getElementById("marcarTodasBtn");

        if (!notificacionesBtn || !notificacionesDropdown) return;

        notificacionesBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.dropdownNotificacionesAbierto = !this.dropdownNotificacionesAbierto;
            notificacionesDropdown.classList.toggle(
                "active",
                this.dropdownNotificacionesAbierto,
            );

            if (this.dropdownNotificacionesAbierto) {
                this._cargarNotificaciones(false);
            }
        });

        document.addEventListener("click", (e) => {
            if (
                !notificacionesBtn.contains(e.target) &&
                !notificacionesDropdown.contains(e.target)
            ) {
                this.dropdownNotificacionesAbierto = false;
                notificacionesDropdown.classList.remove("active");
            }
        });

        if (marcarTodasBtn) {
            marcarTodasBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this._marcarTodasLeidas();
            });
        }
    }

    // ========== NAVBAR HTML Y ESTILOS ==========
    removeOriginalNavbar() {
        const originalHeader = document.getElementById("main-header");
        originalHeader?.remove();
    }

    createNavbar() {
        this.addStyles();
        this.insertHTML();
        this.adjustBodyPadding();
    }

    addStyles() {
        if (document.getElementById("navbar-complete-styles")) return;

        const styles = /*css*/ `
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
                width: 350px;
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
                max-height: 400px;
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
            
            /* ========== NUEVO: Estilo para notificaciones de evento ========== */
            .notificacion-item.notificacion-evento {
                border-left: 3px solid #e74c3c;
            }
            
            .notificacion-item.notificacion-evento:hover {
                border-left-color: #ff6b6b;
                background-color: rgba(231, 76, 60, 0.1);
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
            
            .gestionar-dropdown-btn,
            .incidencias-dropdown-btn,
            .configuracion-dropdown-btn,
            .monitoreo-dropdown-btn {
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
            
            .gestionar-dropdown-btn:hover,
            .incidencias-dropdown-btn:hover,
            .configuracion-dropdown-btn:hover,
            .monitoreo-dropdown-btn:hover {
                background-color: var(--color-bg-secondary);
                transform: translateY(-2px);
                box-shadow: 0 5px 12px rgba(0, 0, 0, 0.15);
            }
            
            .gestionar-dropdown-btn i,
            .incidencias-dropdown-btn i,
            .configuracion-dropdown-btn i,
            .monitoreo-dropdown-btn i {
                transition: transform 0.3s ease;
                font-size: 14px;
            }
            
            .gestionar-dropdown-btn.active i,
            .incidencias-dropdown-btn.active i,
            .configuracion-dropdown-btn.active i,
            .monitoreo-dropdown-btn.active i {
                transform: rotate(180deg);
            }
            
            .gestionar-dropdown-options,
            .incidencias-dropdown-options,
            .configuracion-dropdown-options,
            .monitoreo-dropdown-options {
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
            
            .gestionar-dropdown-options.active,
            .incidencias-dropdown-options.active,
            .configuracion-dropdown-options.active,
            .monitoreo-dropdown-options.active {
                display: flex;
                opacity: 1;
                overflow: clip;
                margin-bottom: 15px;
                position: static;
                height: auto;
                flex-direction: column;
            }
            
            .gestionar-dropdown-option,
            .incidencias-dropdown-option,
            .configuracion-dropdown-option,
            .monitoreo-dropdown-option {
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
            
            .gestionar-dropdown-option:hover,
            .incidencias-dropdown-option:hover,
            .configuracion-dropdown-option:hover,
            .monitoreo-dropdown-option:hover {
                background-color: var(--color-bg-secondary);
                transform: translateX(5px);
                box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
            }
            
            .gestionar-dropdown-option i,
            .incidencias-dropdown-option i,
            .configuracion-dropdown-option i,
            .monitoreo-dropdown-option i {
                width: 20px;
                text-align: center;
                font-size: 16px;
                color: var(--color-accent-primary);
                flex-shrink: 0;
            }
            
            .gestionar-dropdown-option span,
            .incidencias-dropdown-option span,
            .configuracion-dropdown-option span,
            .monitoreo-dropdown-option span {
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
            
            .configuracion-options-section {
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
                overflow: clip !important;
            }

            .gestionar-dropdown-options,
            .incidencias-dropdown-options,
            .configuracion-dropdown-options,
            .monitoreo-dropdown-options {
                overflow: clip !important;
                max-height: none !important;
                height: auto !important;
            }

            .gestionar-dropdown-options.active,
            .incidencias-dropdown-options.active,
            .configuracion-dropdown-options.active,
            .monitoreo-dropdown-options.active {
                overflow: clip !important;
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
                    width: 300px;
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
                
                .gestionar-dropdown-btn,
                .incidencias-dropdown-btn,
                .configuracion-dropdown-btn,
                .monitoreo-dropdown-btn {
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
                
                .gestionar-dropdown-options,
                .incidencias-dropdown-options,
                .configuracion-dropdown-options,
                .monitoreo-dropdown-options {
                    padding: 12px;
                }
                
                .gestionar-dropdown-options.active,
                .incidencias-dropdown-options.active,
                .configuracion-dropdown-options.active,
                .monitoreo-dropdown-options.active {
                    max-height: 1500px;
                }
                
                .gestionar-dropdown-option,
                .incidencias-dropdown-option,
                .configuracion-dropdown-option,
                .monitoreo-dropdown-option {
                    padding: 14px 12px;
                    gap: 12px;
                }
                
                .gestionar-dropdown-option i,
                .incidencias-dropdown-option i,
                .configuracion-dropdown-option i,
                .monitoreo-dropdown-option i {
                    font-size: 16px;
                    width: 24px;
                }
                
                .gestionar-dropdown-option span,
                .incidencias-dropdown-option span,
                .configuracion-dropdown-option span,
                .monitoreo-dropdown-option span {
                    font-size: 15px;
                    line-height: 1.4;
                }
                
                .nav-section-title {
                    font-size: 15px;
                }
                
                .notificaciones-dropdown {
                    width: 280px;
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
                
                .gestionar-dropdown-option,
                .incidencias-dropdown-option,
                .configuracion-dropdown-option,
                .monitoreo-dropdown-option {
                    padding: 12px 10px;
                }
                
                .gestionar-dropdown-option span,
                .incidencias-dropdown-option span,
                .configuracion-dropdown-option span,
                .monitoreo-dropdown-option span {
                    font-size: 14px;
                }
                
                .notificaciones-dropdown {
                    width: 260px;
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
            
            /* ========== NUEVO: Estilos para SweetAlert de eventos ========== */
            .swal-event-popup {
                border-radius: 12px !important;
            }
            
            .swal-event-title {
                font-family: 'Orbitron', sans-serif !important;
                font-size: 20px !important;
            }
            
            .swal-event-html {
                font-family: var(--font-family-primary) !important;
            }
        `;

        const styleElement = document.createElement("style");
        styleElement.id = "navbar-complete-styles";
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    insertHTML() {
        const navbar = document.createElement("header");
        navbar.id = "complete-navbar";
        navbar.innerHTML = /*html*/ `
            <div class="navbar-top-section">
                <div class="navbar-left-container">
                    <a href="../panelControl/panelControl.html" class="navbar-logo-link">
                        <div class="logo-circle-container">
                            <img src="/assets/images/logo.png" alt="Centinela Logo" class="navbar-logo-img">
                        </div>
                    </a>

                    <div class="logo-separator"></div>

                    <a href="../panelControl/panelControl.html" class="navbar-logo-link" id="orgLogoLink">
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
                                <h3>Notificaciones</h3>
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
                            <img src="/assets/images/logo.png" alt="Usuario" class="admin-profile-img" id="userProfileImg">
                            <div class="profile-placeholder" id="profilePlaceholder" style="display: none;">
                                <i class="fas fa-user"></i>
                                <span>Usuario</span>
                            </div>
                        </div>
                       
                    </div>

                    <div class="admin-info">
                        <div class="admin-name" id="userName">Cargando...</div>
                        <div class="admin-role" id="userRole"></div>
                        <div class="admin-email" id="userEmail">cargando@email.com</div>
                        <div class="admin-organization" id="userOrganization"></div>
                    </div>
                </div>

                <!-- SECCIÓN GESTIONAR -->
                <div class="nav-section">
                    <button class="gestionar-dropdown-btn" id="gestionarDropdownBtn">
                        <span><i class="fa-solid fa-gear"></i> Gestionar</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="gestionar-dropdown-options" id="gestionarDropdownOptions">
                        <a href="../areas/areas.html" class="gestionar-dropdown-option" id="areasBtn">
                            <i class="fa-solid fa-map"></i>
                            <span>Áreas</span>
                        </a>
                        <a href="../categorias/categorias.html" class="gestionar-dropdown-option" id="categoriasBtn">
                            <i class="fa-solid fa-tags"></i>
                            <span>Categorías</span>
                        </a>
                        <a href="../sucursales/sucursales.html" class="gestionar-dropdown-option" id="sucursalesBtn">
                            <i class="fa-solid fa-store"></i>
                            <span>Sucursales</span>
                        </a>
                        <a href="../regiones/regiones.html" class="gestionar-dropdown-option" id="regionesBtn">
                               <i class="fa-solid fa-location-dot"></i>
                            <span>Regiones</span>
                        </a>
                        <a href="../permisos/permisos.html" class="gestionar-dropdown-option" id="permisosBtn">
                            <i class="fa-solid fa-user-shield"></i>
                            <span>Permisos</span>
                        </a>
                        <a href="../usuarios/usuarios.html" class="gestionar-dropdown-option" id="usuariosBtn">
                            <i class="fa-solid fa-users"></i>
                            <span>Usuarios</span>
                        </a>
                        <a href="../tareas/tareas.html" class="gestionar-dropdown-option" id="tareasBtn">
                            <i class="fa-solid fa-tasks"></i>
                            <span>Tareas</span>
                        </a>
                    </div>
                </div>

                <!-- SECCIÓN INCIDENCIAS -->
                <div class="nav-section" id="incidenciasNavSection">
                    <button class="incidencias-dropdown-btn" id="incidenciasDropdownBtn">
                        <span><i class="fa-solid fa-exclamation-triangle"></i> Incidencias</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="incidencias-dropdown-options" id="incidenciasDropdownOptions">
                        <a href="../incidencias/incidencias.html" class="incidencias-dropdown-option" id="incidenciasBtn">
                            <i class="fa-solid fa-list"></i>
                            <span>Lista de Incidencias</span>
                        </a>
                        <a href="../crearIncidencias/crearIncidencias.html" class="incidencias-dropdown-option" id="crearIncidenciasBtn">
                            <i class="fa-solid fa-plus-circle"></i>
                            <span>Crear Incidencia</span>
                        </a>
                        <a href="../incidenciasCanalizadas/incidenciasCanalizadas.html" class="incidencias-dropdown-option" id="incidenciasCanalizadasBtn">
                            <i class="fa-solid fa-check-circle"></i>
                            <span>Incidencias Canalizadas</span>
                        </a>
                         <a href="../estadisticas/estadisticas.html" class="gestionar-dropdown-option" id="estadisticasBtn" style="width: 100%;">
                        <i class="fa-solid fa-chart-simple"></i>
                        <span>Estadísticas incidencias</span>
                    </a>

                        <!-- === NUEVAS OPCIONES DE INCIDENCIAS DE RECUPERACIÓN (MERCANCÍA PERDIDA) === -->
            
                        
                        <a href="../incidenciasRecuperacion/incidenciasRecuperacion.html" class="incidencias-dropdown-option" id="incidenciasRecuperacionBtn">
                            <i class="fa-solid fa-list"></i>
                            <span>Incidencias de Recuperación</span>
                        </a>
                        <a href="../crearIncidenciasRecuperacion/crearIncidenciasRecuperacion.html" class="incidencias-dropdown-option" id="crearIncidenciasRecuperacionBtn">
                            <i class="fa-solid fa-plus-circle"></i>
                            <span>Crear Incidencia de Recuperación</span>
                        </a>
                        <a href="../estadisticasIncidenciasRecuperacion/estadisticasIncidenciasRecuperacion.html" class="incidencias-dropdown-option" id="estadisticasIncidenciasRecuperacionBtn">
                            <i class="fa-solid fa-chart-line"></i>
                            <span>Estadísticas de Recuperación</span>
                        </a>
                    </div>
                </div>

                <!-- SECCIÓN MONITOREO (NUEVO) -->
                <div class="nav-section" id="monitoreoNavSection">
                    <button class="monitoreo-dropdown-btn" id="monitoreoDropdownBtn">
                        <span><i class="fa-solid fa-map-marker-alt"></i> Monitoreo</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="monitoreo-dropdown-options" id="monitoreoDropdownOptions">
                        <a href="../mapaAlertas/mapaAlertas.html" class="monitoreo-dropdown-option" id="mapaAlertasBtn">
                            <i class="fa-solid fa-map-location-dot"></i>
                            <span>Mapa de Alertas</span>
                        </a>
                        <a href="../monitoreo/monitoreo.html" class="monitoreo-dropdown-option" id="monitoreoGeneralBtn">
                            <i class="fa-solid fa-tachometer-alt"></i>
                            <span>Monitoreo</span>
                        </a>
                        
                        <a href="../loginMonitoreo/loginMonitoreo.html" class="monitoreo-dropdown-option" id="loginMonitoreoBtn">
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
                    <a href="../bitacoraActividades/bitacoraActividades.html" class="gestionar-dropdown-option" style="width: 100%;">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        <span>Bitácora de Actividades</span>
                    </a>
                </div>

                <!-- SECCIÓN CONFIGURACIÓN -->
                <div class="configuracion-options-section">
                    <button class="configuracion-dropdown-btn" id="configuracionDropdownBtn">
                        <span><i class="fa-solid fa-user-gear"></i> Configuración</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="configuracion-dropdown-options" id="configuracionDropdownOptions">
                        <a href="#" class="configuracion-dropdown-option logout-option" id="logoutOption">
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
        const navbar = document.getElementById("complete-navbar");
        if (!navbar) return;

        const updatePadding = () => {
            document.body.style.paddingTop = `${navbar.offsetHeight}px`;
        };

        updatePadding();

        const resizeObserver = new ResizeObserver(updatePadding);
        resizeObserver.observe(navbar);
    }

    // ========== CARGA DE USUARIO ==========
    loadUserDataFromLocalStorage() {
        try {
            const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";

            if (!isLoggedIn) {
                return false;
            }

            const userDataString = localStorage.getItem("userData");

            if (userDataString) {
                const userData = JSON.parse(userDataString);

                let fotoUsuario = null;
                let fotoOrganizacion = null;

                if (userData.fotoUsuario && userData.fotoUsuario.length > 10) {
                    fotoUsuario = userData.fotoUsuario;
                } else {
                    const userFotoKey = localStorage.getItem("userFoto");
                    if (userFotoKey && userFotoKey.length > 10) {
                        fotoUsuario = userFotoKey;
                    }
                }

                if (
                    userData.fotoOrganizacion &&
                    userData.fotoOrganizacion.length > 10
                ) {
                    fotoOrganizacion = userData.fotoOrganizacion;
                } else {
                    const orgLogoKey = localStorage.getItem("organizacionLogo");
                    if (orgLogoKey && orgLogoKey.length > 10) {
                        fotoOrganizacion = orgLogoKey;
                    }
                }

                this.currentUser = {
                    id: userData.id || localStorage.getItem("userId"),
                    uid: userData.id,
                    correoElectronico:
                        userData.email || localStorage.getItem("userEmail"),
                    nombreCompleto:
                        userData.nombreCompleto || localStorage.getItem("userNombre"),
                    rol: userData.rol || localStorage.getItem("userRole"),
                    organizacion:
                        userData.organizacion || localStorage.getItem("userOrganizacion"),
                    organizacionCamelCase:
                        userData.organizacionCamelCase ||
                        localStorage.getItem("userOrganizacionCamelCase"),
                    fotoUsuario: fotoUsuario,
                    fotoOrganizacion: fotoOrganizacion,
                    areaId:
                        userData.areaAsignadaId ||
                        userData.areaId ||
                        localStorage.getItem("userAreaId") ||
                        "",
                    areaAsignadaId:
                        userData.areaAsignadaId ||
                        userData.areaId ||
                        localStorage.getItem("userAreaId") ||
                        "",
                    cargoId:
                        userData.cargoId || localStorage.getItem("userCargoId") || "",
                    sucursalAsignadaId:
                        userData.sucursalAsignadaId ||
                        localStorage.getItem("userSucursalId") ||
                        "",
                    sucursalAsignadaNombre:
                        userData.sucursalAsignadaNombre ||
                        localStorage.getItem("userSucursalNombre") ||
                        "",
                    status: userData.status || "activo",
                    verificado: userData.verificado || true,
                    ultimoAcceso: userData.ultimoAcceso || userData.sessionStart,
                    dispositivos: userData.dispositivos || [],
                };

                this.userRole = this.currentUser.rol?.toLowerCase() || "colaborador";

                return true;
            }

            this.currentUser = {
                id: localStorage.getItem("userId"),
                correoElectronico: localStorage.getItem("userEmail"),
                nombreCompleto: localStorage.getItem("userNombre"),
                rol: localStorage.getItem("userRole"),
                organizacion: localStorage.getItem("userOrganizacion"),
                organizacionCamelCase: localStorage.getItem(
                    "userOrganizacionCamelCase",
                ),
                fotoUsuario: localStorage.getItem("userFoto") || null,
                fotoOrganizacion: localStorage.getItem("organizacionLogo") || null,
                areaId: localStorage.getItem("userAreaId") || "",
                cargoId: localStorage.getItem("userCargoId") || "",
                sucursalAsignadaId: localStorage.getItem("userSucursalId") || "",
                sucursalAsignadaNombre:
                    localStorage.getItem("userSucursalNombre") || "",
                dispositivos: [],
            };

            if (this.currentUser.nombreCompleto && this.currentUser.rol) {
                this.userRole = this.currentUser.rol?.toLowerCase() || "colaborador";
                return true;
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    async importPermisoManager() {
        try {
            const { PermisoManager } = await import("/clases/permiso.js");
            this.permisoManager = new PermisoManager();

            if (this.currentUser?.organizacionCamelCase) {
                this.permisoManager.organizacionCamelCase =
                    this.currentUser.organizacionCamelCase;
            }
        } catch (error) {
            // Error silencioso
        }
    }

    // ========== OBTENER PERMISOS REALES DESDE FIRESTORE ==========
    async obtenerPermisosReales() {
        try {
            const esAdmin =
                this.userRole === "administrador" || this.userRole === "master";

            if (esAdmin) {
                this.permisos = {
                    areas: true,
                    categorias: true,
                    sucursales: true,
                    regiones: true,
                    incidencias: true,
                    usuarios: true,
                    estadisticas: true,
                    tareas: true,
                    monitoreo: true,
                    permisos: true,
                    loginMonitoreo: true,
                    crearIncidencias: true,
                    incidenciasCanalizadas: true,
                    verIncidencias: true,
                    bitacora: true,
                    perfil: true,
                    configuracion: true,
                    ayuda: true,
                    incidenciasRecuperacion: true,
                    crearIncidenciasRecuperacion: true,
                    estadisticasIncidenciasRecuperacion: true,
                };
                return;
            }

            if (!this.currentUser?.areaId || !this.currentUser?.cargoId) {
                this.permisos = {
                    areas: false,
                    categorias: false,
                    sucursales: false,
                    regiones: false,
                    incidencias: false,
                    usuarios: false,
                    estadisticas: false,
                    tareas: false,
                    monitoreo: false,
                    permisos: false,
                    loginMonitoreo: false,
                    crearIncidencias: false,
                    incidenciasCanalizadas: false,
                    verIncidencias: false,
                    bitacora: false,
                    perfil: true,
                    configuracion: true,
                    ayuda: true,
                    incidenciasRecuperacion: false,
                    crearIncidenciasRecuperacion: false,
                    estadisticasIncidenciasRecuperacion: false,
                };
                return;
            }

            if (this.permisoManager) {
                try {
                    const permiso = await this.permisoManager.obtenerPorCargoYArea(
                        this.currentUser.cargoId,
                        this.currentUser.areaId,
                        this.currentUser.organizacionCamelCase,
                    );

                    if (permiso) {
                        const tieneIncidencias = permiso.puedeAcceder("incidencias");
                        const tieneMonitoreo = permiso.puedeAcceder("monitoreo");
                        const tieneLoginMonitoreo = permiso.puedeAcceder("loginMonitoreo");
                        const tieneIncidenciasRecuperacion =
                            permiso.puedeAcceder("incidenciasRecuperacion") ||
                            tieneIncidencias;
                        const tieneCrearIncidenciasRecuperacion =
                            permiso.puedeAcceder("crearIncidenciasRecuperacion") ||
                            tieneIncidencias;
                        const tieneEstadisticasIncidenciasRecuperacion =
                            permiso.puedeAcceder("estadisticasIncidenciasRecuperacion") ||
                            tieneIncidencias;

                        this.permisos = {
                            areas: permiso.puedeAcceder("areas"),
                            categorias: permiso.puedeAcceder("categorias"),
                            sucursales: permiso.puedeAcceder("sucursales"),
                            regiones: permiso.puedeAcceder("regiones"),
                            incidencias: tieneIncidencias,
                            usuarios: permiso.puedeAcceder("usuarios"),
                            estadisticas: permiso.puedeAcceder("estadisticas"),
                            tareas: permiso.puedeAcceder("tareas"),
                            monitoreo: tieneMonitoreo,
                            permisos: permiso.puedeAcceder("permisos"),
                            loginMonitoreo: tieneLoginMonitoreo,
                            crearIncidencias: tieneIncidencias,
                            incidenciasCanalizadas: tieneIncidencias,
                            verIncidencias: tieneIncidencias,
                            bitacora: true,
                            perfil: true,
                            configuracion: true,
                            ayuda: true,
                            incidenciasRecuperacion: tieneIncidenciasRecuperacion,
                            crearIncidenciasRecuperacion: tieneCrearIncidenciasRecuperacion,
                            estadisticasIncidenciasRecuperacion:
                                tieneEstadisticasIncidenciasRecuperacion,
                        };
                        return;
                    }
                } catch (error) {
                    // Error silencioso
                }
            }

            this.permisos = {
                areas: false,
                categorias: false,
                sucursales: false,
                regiones: false,
                incidencias: false,
                usuarios: false,
                estadisticas: false,
                tareas: false,
                monitoreo: false,
                permisos: false,
                loginMonitoreo: false,
                crearIncidencias: false,
                incidenciasCanalizadas: false,
                verIncidencias: false,
                bitacora: false,
                perfil: true,
                configuracion: true,
                ayuda: true,
                incidenciasRecuperacion: false,
                crearIncidenciasRecuperacion: false,
                estadisticasIncidenciasRecuperacion: false,
            };
        } catch (error) {
            this.permisos = {
                areas: false,
                categorias: false,
                sucursales: false,
                regiones: false,
                incidencias: false,
                usuarios: false,
                estadisticas: false,
                tareas: false,
                monitoreo: false,
                permisos: false,
                loginMonitoreo: false,
                crearIncidencias: false,
                incidenciasCanalizadas: false,
                verIncidencias: false,
                bitacora: false,
                perfil: true,
                configuracion: true,
                ayuda: true,
                incidenciasRecuperacion: false,
                crearIncidenciasRecuperacion: false,
                estadisticasIncidenciasRecuperacion: false,
            };
        }
    }

    // ========== FILTRAR MENÚ POR PERMISOS ==========
    filterMenuByPermissions() {
        if (!this.permisos) {
            return;
        }

        const gestionarItems = [
            {
                id: "areasBtn",
                modulo: "areas",
                elemento: document.getElementById("areasBtn"),
            },
            {
                id: "categoriasBtn",
                modulo: "categorias",
                elemento: document.getElementById("categoriasBtn"),
            },
            {
                id: "sucursalesBtn",
                modulo: "sucursales",
                elemento: document.getElementById("sucursalesBtn"),
            },
            {
                id: "regionesBtn",
                modulo: "regiones",
                elemento: document.getElementById("regionesBtn"),
            },
            {
                id: "permisosBtn",
                modulo: "permisos",
                elemento: document.getElementById("permisosBtn"),
            },
            {
                id: "usuariosBtn",
                modulo: "usuarios",
                elemento: document.getElementById("usuariosBtn"),
            },
            {
                id: "tareasBtn",
                modulo: "tareas",
                elemento: document.getElementById("tareasBtn"),
            },
        ];

        gestionarItems.forEach((item) => {
            if (!item.elemento) return;
            const debeMostrarse = this.permisos[item.modulo] === true;
            item.elemento.style.display = debeMostrarse ? "flex" : "none";
        });

        const incidenciasItems = [
            {
                id: "incidenciasBtn",
                modulo: "incidencias",
                elemento: document.getElementById("incidenciasBtn"),
            },
            {
                id: "crearIncidenciasBtn",
                modulo: "incidencias",
                elemento: document.getElementById("crearIncidenciasBtn"),
            },
            {
                id: "incidenciasCanalizadasBtn",
                modulo: "incidencias",
                elemento: document.getElementById("incidenciasCanalizadasBtn"),
            },
            {
                id: "incidenciasRecuperacionBtn",
                modulo: "incidenciasRecuperacion",
                elemento: document.getElementById("incidenciasRecuperacionBtn"),
            },
            {
                id: "crearIncidenciasRecuperacionBtn",
                modulo: "crearIncidenciasRecuperacion",
                elemento: document.getElementById("crearIncidenciasRecuperacionBtn"),
            },
            {
                id: "estadisticasIncidenciasRecuperacionBtn",
                modulo: "estadisticasIncidenciasRecuperacion",
                elemento: document.getElementById(
                    "estadisticasIncidenciasRecuperacionBtn",
                ),
            },
        ];

        incidenciasItems.forEach((item) => {
            if (!item.elemento) return;
            const debeMostrarse = this.permisos[item.modulo] === true;
            item.elemento.style.display = debeMostrarse ? "flex" : "none";
        });

        const monitoreoItems = [
            {
                id: "monitoreoGeneralBtn",
                modulo: "monitoreo",
                elemento: document.getElementById("monitoreoGeneralBtn"),
            },
            {
                id: "mapaAlertasBtn",
                modulo: "monitoreo",
                elemento: document.getElementById("mapaAlertasBtn"),
            },
            {
                id: "loginMonitoreoBtn",
                modulo: "loginMonitoreo",
                elemento: document.getElementById("loginMonitoreoBtn"),
            },
        ];

        monitoreoItems.forEach((item) => {
            if (!item.elemento) return;
            let debeMostrarse = false;
            if (item.modulo === "monitoreo") {
                debeMostrarse = this.permisos.monitoreo === true;
            } else if (item.modulo === "loginMonitoreo") {
                debeMostrarse = this.permisos.loginMonitoreo === true;
            }
            item.elemento.style.display = debeMostrarse ? "flex" : "none";
        });

        const estadisticasBtn = document.getElementById("estadisticasBtn");
        if (estadisticasBtn) {
            estadisticasBtn.style.display =
                this.permisos.estadisticas === true ? "flex" : "none";
        }

        this.ocultarSeccionMonitoreo();
        this.ocultarSeccionIncidencias();
    }

    ocultarSeccionMonitoreo() {
        const tieneMonitoreo =
            this.permisos?.monitoreo === true ||
            this.permisos?.loginMonitoreo === true;
        const monitoreoSection = document.getElementById("monitoreoNavSection");

        if (monitoreoSection) {
            monitoreoSection.style.display = tieneMonitoreo ? "block" : "none";
        }
    }

    ocultarSeccionIncidencias() {
        const tienePermisoIncidencias = this.permisos?.incidencias === true;
        const incidenciasSection = document.getElementById("incidenciasNavSection");

        if (incidenciasSection) {
            incidenciasSection.style.display = tienePermisoIncidencias
                ? "block"
                : "none";
        }
    }

    updateNavbarWithUserData() {
        if (!this.currentUser) {
            const userName = document.getElementById("userName");
            const userRole = document.getElementById("userRole");
            const userEmail = document.getElementById("userEmail");
            const userOrganization = document.getElementById("userOrganization");

            if (userName) userName.textContent = "No autenticado";
            if (userRole) userRole.textContent = "Visitante";
            if (userEmail) userEmail.textContent = "Inicia sesión para continuar";
            if (userOrganization) userOrganization.textContent = "";

            return;
        }

        this.updateOrganizationLogo();
        this.updateUserMenuInfo();
    }

    updateOrganizationLogo() {
        const organizationLogoImg = document.getElementById("orgLogoImg");
        const orgTextLogo = document.getElementById("orgTextLogo");
        const orgLogoLink = document.getElementById("orgLogoLink");
        const orgLogoContainer = document.getElementById("orgLogoContainer");

        if (
            !organizationLogoImg ||
            !orgTextLogo ||
            !orgLogoLink ||
            !orgLogoContainer
        )
            return;

        if (
            this.currentUser.fotoOrganizacion &&
            this.currentUser.fotoOrganizacion.length > 10
        ) {
            organizationLogoImg.src = this.currentUser.fotoOrganizacion;
            organizationLogoImg.alt = `Logo de ${this.currentUser.organizacion}`;
            organizationLogoImg.style.display = "block";
            orgTextLogo.style.display = "none";
            organizationLogoImg.title = this.currentUser.organizacion;
        } else {
            this.showOrgTextLogo();
        }

        orgLogoLink.href = "../panelControl/panelControl.html";
    }

    showOrgTextLogo() {
        const organizationLogoImg = document.getElementById("orgLogoImg");
        const orgTextLogo = document.getElementById("orgTextLogo");

        if (!organizationLogoImg || !orgTextLogo) return;

        organizationLogoImg.style.display = "none";
        orgTextLogo.style.display = "flex";

        const orgName = this.currentUser?.organizacion || "Organización";
        const initials = orgName
            .split(" ")
            .map((word) => word.charAt(0))
            .join("")
            .toUpperCase()
            .substring(0, 3);

        orgTextLogo.textContent = initials;
        orgTextLogo.title = orgName;
    }

    updateUserMenuInfo() {
        const userName = document.getElementById('userName');
        if (userName) {
            userName.textContent = this.currentUser.nombreCompleto || 'Usuario';
        }

        const userRole = document.getElementById('userRole');
        if (userRole) {
            // Mostrar valor por defecto inmediatamente
            const rol = this.currentUser.rol || 'colaborador';
            userRole.textContent = rol.charAt(0).toUpperCase() + rol.slice(1).toLowerCase();

            // Luego actualizar con el cargo real (sin bloquear)
            this.cargarAreaYCargo().then(info => {
                if (info.cargoNombre) {
                    userRole.textContent = info.cargoNombre;
                }
            }).catch(() => { });
        }

        const userEmail = document.getElementById('userEmail');
        if (userEmail) {
            userEmail.textContent = this.currentUser.correoElectronico || 'No especificado';
        }

        const userOrganization = document.getElementById('userOrganization');
        if (userOrganization) {
            userOrganization.textContent = this.currentUser.organizacion || 'Sin organización';
        }

        const userProfileImg = document.getElementById('userProfileImg');
        const profilePlaceholder = document.getElementById('profilePlaceholder');

        if (userProfileImg && profilePlaceholder) {
            if (this.currentUser.fotoUsuario && this.currentUser.fotoUsuario.length > 10) {
                userProfileImg.src = this.currentUser.fotoUsuario;
                userProfileImg.style.display = 'block';
                profilePlaceholder.style.display = 'none';
                userProfileImg.alt = `Foto de ${this.currentUser.nombreCompleto}`;
            } else {
                this.showProfilePlaceholder();
            }
        }
    }

    async cargarAreaYCargo() {
        try {
            const areaId = this.currentUser.areaAsignadaId || this.currentUser.areaId || '';
            const cargoId = this.currentUser.cargoId || '';

            if (!areaId || !this.currentUser.organizacionCamelCase) {
                return { areaNombre: '', cargoNombre: '' };
            }

            // ========== VERIFICAR CACHE PRIMERO ==========
            const CACHE_KEY = `area_cargo_${this.currentUser.id}_${areaId}_${cargoId}`;
            const cached = localStorage.getItem(CACHE_KEY);

            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    // Cache válido por 30 minutos
                    if (data.timestamp && (Date.now() - data.timestamp) < 30 * 60 * 1000) {
                        return { areaNombre: data.areaNombre, cargoNombre: data.cargoNombre };
                    }
                } catch (e) {
                    // Cache corrupto, continuar
                }
            }

            // Si no hay cache, consultar Firestore
            const { AreaManager } = await import('/clases/area.js');
            const areaManager = new AreaManager();
            const area = await areaManager.getAreaById(areaId, this.currentUser.organizacionCamelCase);

            let areaNombre = '';
            let cargoNombre = '';

            if (area) {
                areaNombre = area.nombreArea;
                if (cargoId && area.cargos && area.cargos[cargoId]) {
                    cargoNombre = area.cargos[cargoId].nombre;
                }
            }

            // Guardar en cache
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    areaNombre,
                    cargoNombre,
                    timestamp: Date.now()
                }));
            } catch (e) {
                // Error guardando cache, no crítico
            }

            return { areaNombre, cargoNombre };
        } catch (error) {
            console.error('Error cargando área/cargo:', error);
            return { areaNombre: '', cargoNombre: '' };
        }
    }

    showProfilePlaceholder() {
        const userProfileImg = document.getElementById("userProfileImg");
        const profilePlaceholder = document.getElementById("profilePlaceholder");

        if (!userProfileImg || !profilePlaceholder) return;

        userProfileImg.style.display = "none";
        profilePlaceholder.style.display = "flex";

        const placeholderText = profilePlaceholder.querySelector("span");
        if (placeholderText && this.currentUser?.nombreCompleto) {
            const initials = this.currentUser.nombreCompleto
                .split(" ")
                .map((word) => word.charAt(0))
                .join("")
                .toUpperCase()
                .substring(0, 2);
            placeholderText.textContent = initials;
        }
    }

    // ========== CONFIGURACIÓN DE DROPDOWNS Y FUNCIONALIDADES ==========
    setupFunctionalities() {
        this.setupMenu();
        this.setupScroll();
        this.loadFontAwesome();
        this.setupGestionarDropdown();
        this.setupIncidenciasDropdown();
        this.setupMonitoreoDropdown();
        this.setupConfiguracionDropdown();
        this.loadOrbitronFont();
        this.setupLogout();
        this._configurarNotificacionesDropdown();

        const verTodasFooter = document.querySelector(
            ".ver-todas-notificaciones-footer",
        );
        if (verTodasFooter) {
            verTodasFooter.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._mostrarModalNotificaciones();
            });
        }
    }

    setupMenu() {
        const hamburgerBtn = document.getElementById("navbarHamburger");
        const mainMenu = document.getElementById("navbarMainMenu");
        const overlay = document.getElementById("navbarMobileOverlay");

        if (!hamburgerBtn || !mainMenu || !overlay) return;

        const toggleMenu = () => {
            this.isMenuOpen = !this.isMenuOpen;

            mainMenu.classList.toggle("active", this.isMenuOpen);
            hamburgerBtn.classList.toggle("active", this.isMenuOpen);
            overlay.classList.toggle("active", this.isMenuOpen);
            document.body.classList.toggle("menu-open", this.isMenuOpen);

            if (!this.isMenuOpen) {
                if (this.isGestionarDropdownOpen) {
                    this.toggleGestionarDropdown(false);
                }
                if (this.isIncidenciasDropdownOpen) {
                    this.toggleIncidenciasDropdown(false);
                }
                if (this.isMonitoreoDropdownOpen) {
                    this.toggleMonitoreoDropdown(false);
                }
                if (this.isConfiguracionDropdownOpen) {
                    this.toggleConfiguracionDropdown(false);
                }
            }
        };

        const closeMenu = () => {
            if (this.isMenuOpen) {
                this.isMenuOpen = false;
                mainMenu.classList.remove("active");
                hamburgerBtn.classList.remove("active");
                overlay.classList.remove("active");
                document.body.classList.remove("menu-open");

                if (this.isGestionarDropdownOpen) {
                    this.toggleGestionarDropdown(false);
                }
                if (this.isIncidenciasDropdownOpen) {
                    this.toggleIncidenciasDropdown(false);
                }
                if (this.isMonitoreoDropdownOpen) {
                    this.toggleMonitoreoDropdown(false);
                }
                if (this.isConfiguracionDropdownOpen) {
                    this.toggleConfiguracionDropdown(false);
                }
            }
        };

        hamburgerBtn.addEventListener("click", toggleMenu);
        overlay.addEventListener("click", closeMenu);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isMenuOpen) closeMenu();
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > 992 && this.isMenuOpen) closeMenu();
        });
    }

    setupGestionarDropdown() {
        const dropdownBtn = document.getElementById("gestionarDropdownBtn");
        const dropdownOptions = document.getElementById("gestionarDropdownOptions");

        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
            if (this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }
            if (this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }

            this.isGestionarDropdownOpen = !this.isGestionarDropdownOpen;
            this.toggleGestionarDropdown(this.isGestionarDropdownOpen);
        };

        dropdownBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener("click", (e) => {
            if (
                !dropdownBtn.contains(e.target) &&
                !dropdownOptions.contains(e.target) &&
                this.isGestionarDropdownOpen
            ) {
                this.toggleGestionarDropdown(false);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
        });

        const options = dropdownOptions.querySelectorAll(
            ".gestionar-dropdown-option",
        );
        options.forEach((option) => {
            option.addEventListener("click", () => {
                setTimeout(() => {
                    this.toggleGestionarDropdown(false);
                }, 100);
            });
        });
    }

    setupIncidenciasDropdown() {
        const dropdownBtn = document.getElementById("incidenciasDropdownBtn");
        const dropdownOptions = document.getElementById(
            "incidenciasDropdownOptions",
        );

        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
            if (this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }
            if (this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }

            this.isIncidenciasDropdownOpen = !this.isIncidenciasDropdownOpen;
            this.toggleIncidenciasDropdown(this.isIncidenciasDropdownOpen);
        };

        dropdownBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener("click", (e) => {
            if (
                !dropdownBtn.contains(e.target) &&
                !dropdownOptions.contains(e.target) &&
                this.isIncidenciasDropdownOpen
            ) {
                this.toggleIncidenciasDropdown(false);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
        });

        const options = dropdownOptions.querySelectorAll(
            ".incidencias-dropdown-option",
        );
        options.forEach((option) => {
            option.addEventListener("click", () => {
                setTimeout(() => {
                    this.toggleIncidenciasDropdown(false);
                }, 100);
            });
        });
    }

    setupMonitoreoDropdown() {
        const dropdownBtn = document.getElementById("monitoreoDropdownBtn");
        const dropdownOptions = document.getElementById("monitoreoDropdownOptions");

        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
            if (this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
            if (this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }

            this.isMonitoreoDropdownOpen = !this.isMonitoreoDropdownOpen;
            this.toggleMonitoreoDropdown(this.isMonitoreoDropdownOpen);
        };

        dropdownBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener("click", (e) => {
            if (
                !dropdownBtn.contains(e.target) &&
                !dropdownOptions.contains(e.target) &&
                this.isMonitoreoDropdownOpen
            ) {
                this.toggleMonitoreoDropdown(false);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }
        });

        const options = dropdownOptions.querySelectorAll(
            ".monitoreo-dropdown-option",
        );
        options.forEach((option) => {
            option.addEventListener("click", () => {
                setTimeout(() => {
                    this.toggleMonitoreoDropdown(false);
                }, 100);
            });
        });
    }

    setupConfiguracionDropdown() {
        const dropdownBtn = document.getElementById("configuracionDropdownBtn");
        const dropdownOptions = document.getElementById(
            "configuracionDropdownOptions",
        );

        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
            if (this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
            if (this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }

            this.isConfiguracionDropdownOpen = !this.isConfiguracionDropdownOpen;
            this.toggleConfiguracionDropdown(this.isConfiguracionDropdownOpen);
        };

        dropdownBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener("click", (e) => {
            if (
                !dropdownBtn.contains(e.target) &&
                !dropdownOptions.contains(e.target) &&
                this.isConfiguracionDropdownOpen
            ) {
                this.toggleConfiguracionDropdown(false);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }
        });

        const options = dropdownOptions.querySelectorAll(
            ".configuracion-dropdown-option",
        );
        options.forEach((option) => {
            option.addEventListener("click", () => {
                setTimeout(() => {
                    this.toggleConfiguracionDropdown(false);
                }, 100);
            });
        });
    }

    setupLogout() {
        const logoutOption = document.getElementById("logoutOption");

        if (!logoutOption) return;

        logoutOption.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const confirmLogout = await this.showLogoutConfirmation();

            if (confirmLogout) {
                await this.performLogout();
            }
        });
    }

    async showLogoutConfirmation() {
        return new Promise((resolve) => {
            if (typeof Swal !== "undefined") {
                Swal.fire({
                    title: "¿Cerrar sesión?",
                    text: "¿Estás seguro de que deseas salir del sistema?",
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Sí, cerrar sesión",
                    cancelButtonText: "Cancelar",
                    confirmButtonColor: "#d33",
                    cancelButtonColor: "#3085d6",
                    reverseButtons: true,
                }).then((result) => {
                    resolve(result.isConfirmed);
                });
            } else {
                const confirmed = confirm("¿Estás seguro de que deseas cerrar sesión?");
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

            // ========== Limpiar cache de área/cargo ==========
            if (this.currentUser?.id) {
                const areaId = this.currentUser.areaAsignadaId || this.currentUser.areaId || '';
                const cargoId = this.currentUser.cargoId || '';
                const CACHE_KEY = `area_cargo_${this.currentUser.id}_${areaId}_${cargoId}`;
                localStorage.removeItem(CACHE_KEY);
            }

            this.clearAllStorage();
            await this.showLogoutSuccessMessage();
            this.redirectToLogin();
        } catch (error) {
            this.clearAllStorage();
            this.redirectToLogin();
        }
    }

    clearAllStorage() {
        try {
            localStorage.clear();
            sessionStorage.clear();
            this.clearIndexedDB();
        } catch (error) {
            // Error silencioso
        }
    }

    async clearIndexedDB() {
        try {
            const databases = ["firebaseLocalStorageDb", "firestore", "centinela-db"];

            for (const dbName of databases) {
                try {
                    await indexedDB.deleteDatabase(dbName);
                } catch (e) { }
            }
        } catch (error) {
            // Error silencioso
        }
    }

    async showLogoutSuccessMessage() {
        if (typeof Swal !== "undefined") {
            await Swal.fire({
                icon: "success",
                title: "Sesión cerrada",
                text: "Has cerrado sesión exitosamente. Redirigiendo...",
                timer: 2000,
                showConfirmButton: false,
                timerProgressBar: true,
            });
        }
    }

    redirectToLogin() {
        window.location.href = `/index.html`;
    }

    toggleGestionarDropdown(show) {
        const dropdownBtn = document.getElementById("gestionarDropdownBtn");
        const dropdownOptions = document.getElementById("gestionarDropdownOptions");

        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle("active", show);
            dropdownOptions.classList.toggle("active", show);
            this.isGestionarDropdownOpen = show;
        }
    }

    toggleIncidenciasDropdown(show) {
        const dropdownBtn = document.getElementById("incidenciasDropdownBtn");
        const dropdownOptions = document.getElementById(
            "incidenciasDropdownOptions",
        );

        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle("active", show);
            dropdownOptions.classList.toggle("active", show);
            this.isIncidenciasDropdownOpen = show;
        }
    }

    toggleMonitoreoDropdown(show) {
        const dropdownBtn = document.getElementById("monitoreoDropdownBtn");
        const dropdownOptions = document.getElementById("monitoreoDropdownOptions");

        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle("active", show);
            dropdownOptions.classList.toggle("active", show);
            this.isMonitoreoDropdownOpen = show;
        }
    }

    toggleConfiguracionDropdown(show) {
        const dropdownBtn = document.getElementById("configuracionDropdownBtn");
        const dropdownOptions = document.getElementById(
            "configuracionDropdownOptions",
        );

        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle("active", show);
            dropdownOptions.classList.toggle("active", show);
            this.isConfiguracionDropdownOpen = show;
        }
    }

    setupScroll() {
        const navbar = document.getElementById("complete-navbar");
        if (!navbar) return;

        window.addEventListener("scroll", () => {
            navbar.classList.toggle("scrolled", window.scrollY > 50);
        });
    }

    loadFontAwesome() {
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const faLink = document.createElement("link");
            faLink.rel = "stylesheet";
            faLink.href =
                "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
            document.head.appendChild(faLink);
        }
    }

    loadOrbitronFont() {
        if (!document.querySelector('link[href*="orbitron"]')) {
            const orbitronLink = document.createElement("link");
            orbitronLink.rel = "stylesheet";
            orbitronLink.href =
                "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap";
            document.head.appendChild(orbitronLink);
        }
    }

    async recargarNotificacionesManual() {
        await this._cargarNotificaciones(false);
    }

    _mostrarNotificacionSistema(nuevasNoLeidas) {
        if (Notification.permission !== "granted") return;

        if (nuevasNoLeidas.length === 1) {
            const primera = nuevasNoLeidas[0];
            const notifUI = primera.toUI
                ? primera.toUI()
                : {
                    titulo: primera.titulo,
                    mensaje: primera.mensaje,
                };
            const systemNotif = new Notification(notifUI.titulo, {
                body: notifUI.mensaje,
                icon: "/assets/images/logo.png",
                silent: true,
            });
            systemNotif.onclick = () => {
                window.focus();
                if (primera.urlDestino && primera.urlDestino !== "#") {
                    window.location.href = primera.urlDestino;
                }
                systemNotif.close();
            };
        } else if (nuevasNoLeidas.length > 1) {
            const systemNotif = new Notification(
                `📬 ${nuevasNoLeidas.length} nuevas notificaciones`,
                {
                    body: `Tienes ${nuevasNoLeidas.length} notificaciones sin leer`,
                    icon: "/assets/images/logo.png",
                    silent: true,
                },
            );
            systemNotif.onclick = () => {
                window.focus();
                this._mostrarModalNotificaciones();
                systemNotif.close();
            };
        }
    }
}

new NavbarComplete();
