// ========== /components/atencionEventos.js ==========
// Componente para atender/ignorar eventos de monitoreo desde notificaciones
// Solo visible para usuarios del área de Seguridad

import { Evento } from '/clases/evento.js';
import { NotificacionAreaManager } from '/clases/notificacionArea.js';

class AtencionEventosManager {
    // En el constructor de AtencionEventosManager
    constructor() {
        this.usuarioActual = null;
        this.areaUsuario = null;
        this.cargoUsuario = null;
        this.notificacionManager = null;
        this.esAreaSeguridad = false;
        this.eventosNotificados = new Map();

        // NO hacer await aquí, lanzar en background
        this._inicializar().catch(error => {
            console.error('Error inicializando AtencionEventosManager:', error);
        });

        this.inicializadoPromise = new Promise((resolve) => {
            this._inicializarCompleta = resolve;
        });
    }

    /**
     * Inicializa el manager y carga datos del usuario
     */
    async _inicializar() {
        try {
            this.usuarioActual = this._obtenerUsuarioActual();

            if (!this.usuarioActual) {
                console.warn('⚠️ AtencionEventos: No hay usuario autenticado');
                return;
            }

            await this._cargarAreaYCargo();
            this.esAreaSeguridad = this._verificarAreaSeguridad();

            if (this.esAreaSeguridad) {
                this.notificacionManager = new NotificacionAreaManager();
            }
        } catch (error) {
            console.error('❌ AtencionEventos: Error en inicialización:', error);
        } finally {
            // Liberar siempre la promesa para que el navbar no se quede esperando
            if (this._inicializarCompleta) this._inicializarCompleta();
        }
    }

    /**
     * Obtiene el usuario actual del localStorage
     */
    _obtenerUsuarioActual() {
        try {
            const userDataStr = localStorage.getItem('userData');
            if (!userDataStr) return null;

            const userData = JSON.parse(userDataStr);

            return {
                id: userData.id || userData.uid || localStorage.getItem('userId'),
                nombreCompleto: userData.nombreCompleto || localStorage.getItem('userNombre') || 'Usuario',
                correoElectronico: userData.email || userData.correoElectronico || localStorage.getItem('userEmail'),
                organizacion: userData.organizacion || localStorage.getItem('userOrganizacion'),
                organizacionCamelCase: userData.organizacionCamelCase || localStorage.getItem('userOrganizacionCamelCase'),
                rol: (userData.rol || localStorage.getItem('userRole') || 'colaborador').toLowerCase(),
                areaId: userData.areaAsignadaId || userData.areaId || localStorage.getItem('userAreaId') || '',
                areaAsignadaId: userData.areaAsignadaId || userData.areaId || localStorage.getItem('userAreaId') || '',
                cargoId: userData.cargoId || localStorage.getItem('userCargoId') || '',
                sucursalAsignadaId: userData.sucursalAsignadaId || localStorage.getItem('userSucursalId') || ''
            };
        } catch (error) {
            console.error('❌ AtencionEventos: Error parseando usuario:', error);
            return null;
        }
    }

    /**
     * Carga el área y cargo del usuario desde Firestore
     */
    async _cargarAreaYCargo() {
        try {
            if (!this.usuarioActual?.organizacionCamelCase || !this.usuarioActual?.areaId) {
                return;
            }

            // Importar dinámicamente AreaManager para evitar dependencias circulares
            const { AreaManager } = await import('/clases/area.js');
            const areaManager = new AreaManager();

            const area = await areaManager.getAreaById(
                this.usuarioActual.areaId,
                this.usuarioActual.organizacionCamelCase
            );

            if (area) {
                this.areaUsuario = {
                    id: this.usuarioActual.areaId,
                    nombre: area.nombreArea || '',
                    descripcion: area.descripcion || '',
                    estado: area.estado || 'activa'
                };

                // Obtener nombre del cargo si existe
                if (this.usuarioActual.cargoId && area.cargos && area.cargos[this.usuarioActual.cargoId]) {
                    this.cargoUsuario = {
                        id: this.usuarioActual.cargoId,
                        nombre: area.cargos[this.usuarioActual.cargoId].nombre || ''
                    };
                }
            }

        } catch (error) {
            console.error('❌ AtencionEventos: Error cargando área/cargo:', error);
        }
    }

    /**
     * Verifica si el usuario pertenece al área de Seguridad
     */
    _verificarAreaSeguridad() {
        if (!this.areaUsuario || !this.areaUsuario.nombre) {
            return false;
        }

        // Verificar por nombre del área (case insensitive)
        const nombreArea = this.areaUsuario.nombre.toLowerCase();
        const esSeguridad = nombreArea === 'seguridad' ||
            nombreArea.includes('seguridad');

        // También verificar por descripción
        const descripcion = (this.areaUsuario.descripcion || '').toLowerCase();
        const descripcionSeguridad = descripcion.includes('seguridad');

        return esSeguridad || descripcionSeguridad;
    }

    /**
     * Verifica si una notificación es de tipo evento de monitoreo
     */
    esNotificacionEvento(notificacion) {
        // Verificar si la notificación tiene datos de evento
        const detalles = notificacion.detalles || {};
        const data = notificacion.data || {};

        // Tipos que indican que es un evento de monitoreo
        const esTipoEvento = notificacion.tipo === 'evento_monitoreo' ||
            notificacion.tipo === 'alarma' ||
            notificacion.tipo === 'monitoreo';

        // Verificar si tiene eventId en detalles
        const tieneEventId = !!(detalles.eventId || data.eventId || notificacion.eventId);

        // Verificar si tiene panel_serial o description (características de eventos)
        const tieneDatosPanel = !!(detalles.panel_serial || data.panel_serial ||
            detalles.description || data.description);

        return esTipoEvento || tieneEventId || tieneDatosPanel;
    }

    /**
     * Extrae el ID del evento desde una notificación
     */
    _extraerEventoId(notificacion) {
        const detalles = notificacion.detalles || {};
        const data = notificacion.data || {};

        return detalles.eventId ||
            data.eventId ||
            notificacion.eventId ||
            notificacion.incidenciaId ||
            null;
    }

    /**
     * Procesa una notificación de evento y muestra el SweetAlert de atención
     * @param {Object} notificacion - La notificación a procesar
     * @returns {Promise<boolean>} - true si se procesó correctamente
     */
    async procesarNotificacionEvento(notificacion) {
        try {
            // Validaciones iniciales
            if (!this.esAreaSeguridad) {
                return false;
            }

            if (!this.usuarioActual) {
                console.warn('⚠️ AtencionEventos: No hay usuario autenticado');
                return false;
            }

            if (!notificacion) {
                console.warn('⚠️ AtencionEventos: Notificación inválida');
                return false;
            }

            // Verificar si es una notificación de evento
            if (!this.esNotificacionEvento(notificacion)) {
                return false;
            }

            // Extraer ID del evento
            const eventoId = this._extraerEventoId(notificacion);
            if (!eventoId) {
                console.warn('⚠️ AtencionEventos: No se pudo extraer el ID del evento');
                return false;
            }

            // Verificar si ya fue procesado (evitar duplicados)
            if (this.eventosNotificados.has(eventoId)) {
                const estadoActual = this.eventosNotificados.get(eventoId);
                if (estadoActual !== 'pendiente') {
                    return false;
                }
            }

            // Obtener el evento completo desde Firestore
            const evento = await Evento.obtenerPorId(eventoId);

            if (!evento) {
                console.warn(`⚠️ AtencionEventos: No se encontró el evento ${eventoId}`);
                return false;
            }

            // Verificar si el evento ya fue atendido o ignorado
            if (evento.estadoEvento !== 'pendiente') {
                this.eventosNotificados.set(eventoId, evento.estadoEvento);

                // Eliminar notificación para este usuario si el evento ya no está pendiente
                await this._eliminarNotificacionEvento(notificacion.id, eventoId);
                return false;
            }

            // Guardar en cache
            this.eventosNotificados.set(eventoId, 'pendiente');

            // Mostrar SweetAlert de atención
            const resultado = await this._mostrarModalAtencionEvento(evento, notificacion);

            if (resultado) {
                // Actualizar cache
                this.eventosNotificados.set(eventoId, resultado.accion);

                // Eliminar notificación para todos los usuarios del área de Seguridad
                await this._eliminarNotificacionParaAreaSeguridad(notificacion.id, eventoId);

                return true;
            }

            return false;

        } catch (error) {
            console.error('❌ AtencionEventos: Error procesando notificación:', error);
            return false;
        }
    }

    async _mostrarModalAtencionEvento(evento, notificacion) {
        return new Promise(async (resolve) => {
            try {
                const esMedicalAlarm = evento.type_id === 584;
                const esAlarma = evento.esAlarma;
                const htmlContent = this._construirHTMLEvento(evento);

                const swalConfig = {
                    title: this._generarTituloModal(evento),
                    html: htmlContent,
                    showCancelButton: true,
                    showDenyButton: true,
                    confirmButtonText: `<i class="fas fa-check-circle"></i> Atender`,
                    denyButtonText: `<i class="fas fa-ban"></i> Ignorar`,
                    cancelButtonText: `<i class="fas fa-times"></i> Cerrar`,
                    confirmButtonColor: '#2ecc71',
                    denyButtonColor: '#95a5a6',
                    cancelButtonColor: '#6c757d',
                    width: '600px',
                    background: '#1a1a2e',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-event-popup',
                        title: 'swal-event-title',
                        htmlContainer: 'swal-event-html'
                    },
                    showLoaderOnConfirm: true,
                    allowOutsideClick: true,
                    allowEscapeKey: true,
                    preConfirm: async () => {
                        const { value: mensaje } = await Swal.fire({
                            title: 'Mensaje de atención',
                            text: '¿Deseas agregar un mensaje? (opcional)',
                            input: 'text',
                            inputPlaceholder: 'Ej: Evento atendido, se verificó la zona...',
                            showCancelButton: false,
                            confirmButtonText: 'Continuar',
                            confirmButtonColor: '#2ecc71',
                            background: '#1a1a2e',
                            color: '#ffffff'
                        });
                        return { accion: 'atender', mensaje: mensaje || '' };
                    },
                    preDeny: async () => {
                        const { value: motivo } = await Swal.fire({
                            title: 'Motivo para ignorar',
                            text: 'Por favor indica el motivo (opcional)',
                            input: 'text',
                            inputPlaceholder: 'Ej: Falsa alarma, evento de sistema...',
                            showCancelButton: false,
                            confirmButtonText: 'Continuar',
                            confirmButtonColor: '#95a5a6',
                            background: '#1a1a2e',
                            color: '#ffffff'
                        });
                        return { accion: 'ignorar', motivo: motivo || 'Evento ignorado' };
                    }
                };

                const result = await Swal.fire(swalConfig);

                if (result.isConfirmed) {
                    const mensaje = result.value?.mensaje || '';

                    try {
                        Swal.showLoading();

                        // Marcar evento como atendido (esto actualizará la notificación automáticamente)
                        await evento.marcarComoAtendido(
                            this.usuarioActual.id,
                            this.usuarioActual.nombreCompleto,
                            mensaje
                        );

                        Swal.fire({
                            icon: 'success',
                            title: '¡Evento atendido!',
                            text: 'El evento ha sido marcado como atendido correctamente.',
                            timer: 2000,
                            showConfirmButton: false,
                            background: '#1a1a2e',
                            color: '#ffffff'
                        });

                        resolve({ accion: 'atendido', mensaje });

                    } catch (error) {
                        console.error('❌ Error al atender evento:', error);
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'No se pudo atender el evento: ' + error.message,
                            background: '#1a1a2e',
                            color: '#ffffff'
                        });
                        resolve(null);
                    }

                } else if (result.isDenied) {
                    const motivo = result.value?.motivo || 'Evento ignorado';

                    try {
                        Swal.showLoading();

                        // Marcar evento como ignorado (esto actualizará la notificación automáticamente)
                        await evento.marcarComoIgnorado(
                            this.usuarioActual.id,
                            this.usuarioActual.nombreCompleto,
                            motivo
                        );

                        Swal.fire({
                            icon: 'success',
                            title: 'Evento ignorado',
                            text: 'El evento ha sido marcado como ignorado.',
                            timer: 2000,
                            showConfirmButton: false,
                            background: '#1a1a2e',
                            color: '#ffffff'
                        });

                        resolve({ accion: 'ignorado', motivo });

                    } catch (error) {
                        console.error('❌ Error al ignorar evento:', error);
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'No se pudo ignorar el evento: ' + error.message,
                            background: '#1a1a2e',
                            color: '#ffffff'
                        });
                        resolve(null);
                    }

                } else {
                    resolve(null);
                }

            } catch (error) {
                console.error('❌ AtencionEventos: Error en modal:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Ocurrió un error al procesar la solicitud',
                    background: '#1a1a2e',
                    color: '#ffffff'
                });
                resolve(null);
            }
        });
    }

    /**
     * Construye el HTML con la información completa del evento
     */
    _construirHTMLEvento(evento) {
        const esMedicalAlarm = evento.type_id === 584;
        const esAlarma = evento.esAlarma;
        const esRestauracion = evento.esRestauracion;

        // Determinar color según tipo
        let borderColor = '#3498db';
        let iconoPrincipal = 'fa-bell';

        if (esMedicalAlarm) {
            borderColor = '#e74c3c';
            iconoPrincipal = 'fa-heartbeat';
        } else if (esAlarma) {
            borderColor = '#e67e22';
            iconoPrincipal = 'fa-exclamation-triangle';
        } else if (esRestauracion) {
            borderColor = '#2ecc71';
            iconoPrincipal = 'fa-check-circle';
        }

        // Construir HTML
        return `
            <div style="text-align: left; max-height: 500px; overflow-y: auto; padding: 5px;">
                <!-- Encabezado con icono y tipo -->
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 15px;
                    background: ${borderColor}20;
                    border-left: 4px solid ${borderColor};
                    border-radius: 8px;
                    margin-bottom: 20px;
                ">
                    <div style="
                        width: 50px;
                        height: 50px;
                        border-radius: 50%;
                        background: ${borderColor};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 24px;
                        color: white;
                    ">
                        <i class="fas ${iconoPrincipal}"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">
                            ${esMedicalAlarm ? '🚨 ALARMA MÉDICA' : (esAlarma ? '🔔 ALARMA' : '📋 EVENTO')}
                        </div>
                        <div style="font-size: 14px; color: #aaa;">
                            ${this._escapeHTML(evento.description || 'Sin descripción')}
                        </div>
                    </div>
                    <div style="
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 600;
                        background: ${evento.prioridadColor}20;
                        color: ${evento.prioridadColor};
                        border: 1px solid ${evento.prioridadColor}40;
                    ">
                        ${evento.prioridad.toUpperCase()}
                    </div>
                </div>
                
                <!-- Información detallada en formato tabla -->
                <div style="
                    background: rgba(0,0,0,0.2);
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                ">
                    <div style="
                        display: grid;
                        grid-template-columns: 120px 1fr;
                        gap: 12px;
                        font-size: 13px;
                    ">
                        <div style="color: #888; font-weight: 500;">
                            <i class="fas fa-microchip" style="width: 20px; color: #00cfff;"></i> Panel:
                        </div>
                        <div style="color: #fff;">
                            <strong>${this._escapeHTML(evento.panel_alias || evento.panel_serial || 'N/A')}</strong>
                            ${evento.panel_alias ? `<br><span style="font-size: 11px; color: #888;">Serial: ${this._escapeHTML(evento.panel_serial)}</span>` : ''}
                        </div>
                        
                        <div style="color: #888; font-weight: 500;">
                            <i class="fas fa-envelope" style="width: 20px; color: #00cfff;"></i> Email:
                        </div>
                        <div style="color: #fff;">
                            ${this._escapeHTML(evento.email_asociado || 'N/A')}
                        </div>
                        
                        <div style="color: #888; font-weight: 500;">
                            <i class="fas fa-calendar" style="width: 20px; color: #00cfff;"></i> Fecha:
                        </div>
                        <div style="color: #fff;">
                            ${evento.fechaFormateada || 'Fecha no disponible'}
                        </div>
                        
                        <div style="color: #888; font-weight: 500;">
                            <i class="fas fa-tag" style="width: 20px; color: #00cfff;"></i> Tipo ID:
                        </div>
                        <div style="color: #fff;">
                            ${evento.type_id || 'N/A'}
                        </div>
                        
                        ${evento.zone_name ? `
                        <div style="color: #888; font-weight: 500;">
                            <i class="fas fa-map-pin" style="width: 20px; color: #00cfff;"></i> Zona:
                        </div>
                        <div style="color: #fff;">
                            ${this._escapeHTML(evento.zone_name)} (Zona ${evento.zone || 'N/A'})
                        </div>
                        ` : ''}
                        
                        ${evento.label ? `
                        <div style="color: #888; font-weight: 500;">
                            <i class="fas fa-tag" style="width: 20px; color: #00cfff;"></i> Etiqueta:
                        </div>
                        <div style="color: #fff;">
                            ${this._escapeHTML(evento.label)}
                        </div>
                        ` : ''}
                        
                        <div style="color: #888; font-weight: 500;">
                            <i class="fas fa-video" style="width: 20px; color: #00cfff;"></i> Video:
                        </div>
                        <div style="color: #fff;">
                            ${evento.video ? '<span style="color: #2ecc71;"><i class="fas fa-check-circle"></i> Disponible</span>' : '<span style="color: #888;"><i class="fas fa-times-circle"></i> No disponible</span>'}
                        </div>
                        
                        <div style="color: #888; font-weight: 500;">
                            <i class="fas fa-circle" style="width: 20px; color: #00cfff;"></i> Estado:
                        </div>
                        <div style="color: #fff;">
                            <span style="
                                display: inline-block;
                                padding: 4px 12px;
                                border-radius: 20px;
                                font-size: 12px;
                                font-weight: 600;
                                background: ${evento.estadoBadge.color}20;
                                color: ${evento.estadoBadge.color};
                            ">
                                <i class="fas ${evento.estadoBadge.icono}"></i> ${evento.estadoBadge.texto}
                            </span>
                        </div>
                    </div>
                </div>
                
                <!-- Particiones/Zonas adicionales si existen -->
                ${evento.partitions && evento.partitions.length > 0 ? `
                <div style="
                    background: rgba(0,0,0,0.2);
                    border-radius: 8px;
                    padding: 12px 15px;
                    margin-bottom: 15px;
                ">
                    <div style="color: #888; font-weight: 500; margin-bottom: 8px;">
                        <i class="fas fa-layer-group" style="margin-right: 8px; color: #00cfff;"></i> Particiones:
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${evento.partitions.map(p => `
                            <span style="
                                padding: 4px 10px;
                                background: rgba(0,207,255,0.1);
                                border-radius: 4px;
                                font-size: 12px;
                            ">${this._escapeHTML(p)}</span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                <!-- Información de atención previa (si existe) -->
                ${evento.atendido ? `
                <div style="
                    background: rgba(46, 204, 113, 0.1);
                    border-left: 4px solid #2ecc71;
                    border-radius: 8px;
                    padding: 12px 15px;
                ">
                    <div style="color: #2ecc71; font-weight: 600; margin-bottom: 8px;">
                        <i class="fas fa-user-check"></i> Información de atención:
                    </div>
                    <div style="font-size: 13px;">
                        <div><strong>Atendido por:</strong> ${this._escapeHTML(evento.nombreUsuarioAtencion || 'Sistema')}</div>
                        <div><strong>Fecha:</strong> ${evento.fechaAtencionFormateada || 'No disponible'}</div>
                        ${evento.mensajeRespuesta ? `<div style="margin-top: 8px;"><strong>Mensaje:</strong> "${this._escapeHTML(evento.mensajeRespuesta)}"</div>` : ''}
                    </div>
                </div>
                ` : ''}
                
                ${evento.estadoEvento === 'ignorado' ? `
                <div style="
                    background: rgba(149, 165, 166, 0.1);
                    border-left: 4px solid #95a5a6;
                    border-radius: 8px;
                    padding: 12px 15px;
                ">
                    <div style="color: #95a5a6; font-weight: 600; margin-bottom: 8px;">
                        <i class="fas fa-ban"></i> Información de evento ignorado:
                    </div>
                    <div style="font-size: 13px;">
                        <div><strong>Ignorado por:</strong> ${this._escapeHTML(evento.nombreUsuarioAtencion || 'Sistema')}</div>
                        ${evento.mensajeRespuesta ? `<div style="margin-top: 8px;"><strong>Motivo:</strong> "${this._escapeHTML(evento.mensajeRespuesta)}"</div>` : ''}
                    </div>
                </div>
                ` : ''}
                
                <!-- Instrucciones -->
                <div style="
                    margin-top: 20px;
                    padding: 10px;
                    background: rgba(0,207,255,0.05);
                    border-radius: 6px;
                    text-align: center;
                    font-size: 12px;
                    color: #888;
                ">
                    <i class="fas fa-info-circle"></i> 
                    Selecciona "Atender" para marcar como resuelto o "Ignorar" si es una falsa alarma
                </div>
            </div>
        `;
    }

    /**
     * Genera el título del modal según el tipo de evento
     */
    _generarTituloModal(evento) {
        if (evento.type_id === 584) {
            return '🚨 ATENCIÓN: Alarma Médica';
        } else if (evento.esAlarma) {
            return '🔔 Atención: Nueva Alarma';
        } else if (evento.esRestauracion) {
            return '✅ Restauración de Alarma';
        } else {
            return '📋 Evento de Monitoreo';
        }
    }

    /**
     * Elimina la notificación para el usuario actual
     */
    async _eliminarNotificacionEvento(notificacionId, eventoId) {
        try {
            if (!this.notificacionManager || !this.usuarioActual) {
                return;
            }

            // Marcar como leída (esto la elimina de la lista del usuario según la lógica actual)
            await this.notificacionManager.marcarComoLeida(
                this.usuarioActual.id,
                notificacionId,
                this.usuarioActual.organizacionCamelCase
            );

        } catch (error) {
            console.error('❌ AtencionEventos: Error eliminando notificación:', error);
        }
    }

    /**
     * Elimina la notificación para TODOS los usuarios del área de Seguridad
     */
    async _eliminarNotificacionParaAreaSeguridad(notificacionId, eventoId) {
        try {
            if (!this.notificacionManager) {
                console.warn('⚠️ AtencionEventos: NotificacionManager no inicializado');
                return;
            }

            // Usar el método específico del NotificacionAreaManager
            // que elimina la notificación para todos los usuarios de un área
            if (typeof this.notificacionManager.eliminarNotificacionParaArea === 'function') {
                await this.notificacionManager.eliminarNotificacionParaArea(
                    notificacionId,
                    'Seguridad', // Nombre del área
                    this.usuarioActual.organizacionCamelCase
                );
            } else {
                console.warn('⚠️ AtencionEventos: Método eliminarNotificacionParaArea no disponible');
            }

        } catch (error) {
            console.error('❌ AtencionEventos: Error eliminando notificación para área:', error);
        }
    }

    /**
     * Verifica si el componente debe estar activo
     */
    isActivo() {
        return this.esAreaSeguridad && this.usuarioActual !== null;
    }

    /**
     * Obtiene el estado actual del componente
     */
    getEstado() {
        return {
            activo: this.isActivo(),
            esAreaSeguridad: this.esAreaSeguridad,
            usuario: this.usuarioActual ? {
                id: this.usuarioActual.id,
                nombre: this.usuarioActual.nombreCompleto
            } : null,
            area: this.areaUsuario ? {
                id: this.areaUsuario.id,
                nombre: this.areaUsuario.nombre
            } : null,
            eventosEnCache: this.eventosNotificados.size
        };
    }

    /**
     * Escapa HTML para prevenir XSS
     */
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

// ========== EXPORTACIÓN ==========
export { AtencionEventosManager };