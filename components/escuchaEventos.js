// ========== /components/escuchaEventos.js - CORREGIDO ==========
// VERSIÓN OPTIMIZADA - Sin acceso directo a db

import { Evento } from '/clases/evento.js';
import { NotificacionAreaManager } from '/clases/notificacionArea.js';

class EscuchaEventosManager {
    constructor() {
        this.usuarioActual = null;
        this.areaUsuario = null;
        this.esAreaSeguridad = false;
        this.notificacionManager = null;
        this.unsubscribe = null;
        this.eventosProcesados = new Set();
        this.eventosNotificados = new Set();
        this.inicializado = false;
        this.cargandoPendientes = false;

        this._inicializar();
    }

    async _inicializar() {
        if (this.inicializado) return;
        this.inicializado = true;

        try {
            this.usuarioActual = this._obtenerUsuarioActual();

            if (!this.usuarioActual) {
                console.warn('⚠️ EscuchaEventos: No hay usuario autenticado');
                return;
            }

            await this._cargarAreaUsuario();
            this.esAreaSeguridad = this._verificarAreaSeguridad();

            if (!this.esAreaSeguridad) {
                return;
            }

            this.notificacionManager = new NotificacionAreaManager();

            // Cargar eventos pendientes existentes
            await this._cargarEventosPendientesExistentes();

            // Iniciar escucha para NUEVOS eventos
            await this._iniciarEscuchaEventos();

        } catch (error) {
            console.error('❌ EscuchaEventos: Error en inicialización:', error);
        }
    }

    _obtenerUsuarioActual() {
        try {
            const userDataStr = localStorage.getItem('userData');
            if (!userDataStr) return null;

            const userData = JSON.parse(userDataStr);

            return {
                id: userData.id || userData.uid || localStorage.getItem('userId'),
                nombreCompleto: userData.nombreCompleto || 'Usuario',
                organizacionCamelCase: userData.organizacionCamelCase || localStorage.getItem('userOrganizacionCamelCase'),
                areaId: userData.areaAsignadaId || userData.areaId || localStorage.getItem('userAreaId') || ''
            };
        } catch (error) {
            console.error('❌ EscuchaEventos: Error parseando usuario:', error);
            return null;
        }
    }

    async _cargarAreaUsuario() {
        try {
            if (!this.usuarioActual?.organizacionCamelCase || !this.usuarioActual?.areaId) {
                return;
            }

            const { AreaManager } = await import('/clases/area.js');
            const areaManager = new AreaManager();

            const area = await areaManager.getAreaById(
                this.usuarioActual.areaId,
                this.usuarioActual.organizacionCamelCase
            );

            if (area) {
                this.areaUsuario = {
                    id: this.usuarioActual.areaId,
                    nombre: area.nombreArea || ''
                };
            }

        } catch (error) {
            console.error('❌ EscuchaEventos: Error cargando área:', error);
        }
    }

    _verificarAreaSeguridad() {
        if (!this.areaUsuario || !this.areaUsuario.nombre) {
            return false;
        }
        const nombreArea = this.areaUsuario.nombre.toLowerCase();
        return nombreArea === 'seguridad' || nombreArea.includes('seguridad');
    }

    async _cargarEventosPendientesExistentes() {
        if (this.cargandoPendientes) return;
        this.cargandoPendientes = true;

        try {
            // Solo eventos de los últimos 7 días
            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() - 7);

            const eventosPendientes = await Evento.obtenerEventosPendientes(
                this.usuarioActual.organizacionCamelCase,
                200,
                fechaLimite
            );

            if (eventosPendientes.length === 0) {
                return;
            }

            let notificacionesCreadas = 0;
            let yaExistentes = 0;
            const primeraCarga = this.eventosProcesados.size === 0;

            const LOTES = 5;
            for (let i = 0; i < eventosPendientes.length; i += LOTES) {
                const lote = eventosPendientes.slice(i, i + LOTES);

                for (const evento of lote) {
                    try {
                        if (this.eventosProcesados.has(evento.id)) {
                            continue;
                        }

                        this.eventosProcesados.add(evento.id);

                        const yaExiste = await Evento.existeNotificacionParaEvento(
                            evento.id,
                            this.usuarioActual.organizacionCamelCase
                        );

                        if (yaExiste) {
                            yaExistentes++;
                            this.eventosNotificados.add(evento.id);
                            continue;
                        }

                        const resultado = await this._crearNotificacionEvento(evento);

                        if (resultado && resultado.success) {
                            notificacionesCreadas++;
                            this.eventosNotificados.add(evento.id);
                        }

                    } catch (error) {
                        console.error(`❌ Error procesando evento ${evento.id}:`, error);
                    }
                }

                await new Promise(r => setTimeout(r, 100));
            }

        } catch (error) {
            console.error('❌ Error cargando eventos pendientes:', error);
        } finally {
            this.cargandoPendientes = false;
        }
    }

    async _iniciarEscuchaEventos() {
        try {
            while (this.cargandoPendientes) {
                await new Promise(r => setTimeout(r, 100));
            }

            // Capturar el momento exacto después de la carga inicial
            // para que la suscripción ignore eventos más viejos
            const ahora = new Date();

            // Solo eventos de los últimos 7 días (igual que carga inicial)
            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() - 7);

            const escucha = Evento.escucharEventosEnTiempoReal(
                this.usuarioActual.organizacionCamelCase,
                async (evento) => {
                    if (this.eventosProcesados.has(evento.id)) return;

                    if (evento.createdAt && evento.createdAt < fechaLimite) return;

                    this.eventosProcesados.add(evento.id);

                    if (evento.estadoEvento !== 'pendiente') return;

                    const yaExiste = await Evento.existeNotificacionParaEvento(
                        evento.id,
                        this.usuarioActual.organizacionCamelCase
                    );
                    if (yaExiste) {
                        this.eventosNotificados.add(evento.id);
                        return;
                    }

                    const resultado = await this._crearNotificacionEvento(evento);
                    if (resultado?.success) {
                        this.eventosNotificados.add(evento.id);
                        window.dispatchEvent(new CustomEvent('nuevaNotificacion', {
                            detail: { eventoId: evento.id, notificacionId: resultado.notificacionId }
                        }));
                    }
                },
                (error) => console.error('❌ Error en escucha:', error),
                ahora  // <-- nuevo parámetro: fecha de inicio para el filtro
            );

            this.unsubscribe = await escucha.subscribe();
        } catch (error) {
            console.error('❌ Error iniciando escucha:', error);
        }
    }

    async _crearNotificacionEvento(evento) {
        try {
            if (!this.notificacionManager) return null;
            const resultado = await this.notificacionManager.notificarEventoMonitoreo({
                evento: evento,
                organizacionCamelCase: this.usuarioActual.organizacionCamelCase,
                enviarPush: true
            });
            return resultado;
        } catch (error) {
            console.error('❌ Error creando notificación:', error);
            return null;
        }
    }

    async recargarEventosPendientes() {
        this.cargandoPendientes = false;
        this.eventosProcesados.clear();
        await this._cargarEventosPendientesExistentes();
    }

    detener() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    getEstado() {
        return {
            inicializado: this.inicializado,
            esAreaSeguridad: this.esAreaSeguridad,
            eventosProcesados: this.eventosProcesados.size,
            eventosNotificados: this.eventosNotificados.size,
            cargandoPendientes: this.cargandoPendientes
        };
    }
}

// Instancia global
if (!window.escuchaEventosGlobal) {
    window.escuchaEventosGlobal = new EscuchaEventosManager();
}

window.recargarEventosPendientes = () => {
    if (window.escuchaEventosGlobal) {
        return window.escuchaEventosGlobal.recargarEventosPendientes();
    }
};

export { EscuchaEventosManager };

window.addEventListener('beforeunload', () => {
    if (window.escuchaEventosGlobal) {
        window.escuchaEventosGlobal.detener();
    }
});