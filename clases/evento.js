// evento.js - Clase para manejar eventos de paneles de control
// Versión CORREGIDA con campos reales de la colección

import { db } from '/config/firebase-config.js';
import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    updateDoc,
    onSnapshot,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import consumo from '/clases/consumoFirebase.js';
import { CuentaPM } from '/clases/cuentaPM.js';

class Evento {
    constructor(id, data = {}) {
        this.id = id || data.id || null;

        // ========== CAMPOS REALES DE LA COLECCIÓN "eventos" ==========
        this.appointment = data.appointment || '';
        this.createdAt = this._convertirTimestamp(data.createdAt);
        this.datetime = data.datetime || '';
        this.description = data.description || '';
        this.device_type = data.device_type || '';
        this.email_asociado = data.email_asociado || '';
        this.event = data.event || 0;
        this.label = data.label || '';
        this.panel_alias = data.panel_alias || '';
        this.panel_serial = data.panel_serial || '';
        this.partitions = data.partitions || [];
        this.timestamp_numero = data.timestamp_numero || 0;
        this.timestamp_original = data.timestamp_original || '';
        this.type_id = data.type_id || 0;
        this.video = data.video || false;
        this.zone = data.zone || 0;
        this.zone_name = data.zone_name || '';

        // ========== CAMPOS DE ATENCIÓN (AGREGADOS POR NOSOTROS) ==========
        this.atendido = data.atendido || false;
        this.fechaAtencion = this._convertirTimestamp(data.fechaAtencion);
        this.idUsuarioAtencion = data.idUsuarioAtencion || '';
        this.nombreUsuarioAtencion = data.nombreUsuarioAtencion || '';
        this.mensajeRespuesta = data.mensajeRespuesta || '';
        this.estadoEvento = data.estadoEvento || 'pendiente'; // pendiente, atendido, ignorado

        // ========== METADATOS ==========
        this.fechaActualizacion = this._convertirTimestamp(data.fechaActualizacion);
    }

    _convertirTimestamp(valor) {
        if (!valor) return null;
        if (valor instanceof Date) return valor;
        if (valor && typeof valor.toDate === 'function') return valor.toDate();
        if (valor instanceof Timestamp) return valor.toDate();
        if (typeof valor === 'string' || typeof valor === 'number') {
            const fecha = new Date(valor);
            return isNaN(fecha.getTime()) ? null : fecha;
        }
        return null;
    }

    // ========== GETTERS ==========

    get fechaFormateada() {
        if (!this.createdAt) return 'Fecha no disponible';
        return this.createdAt.toLocaleString('es-MX', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    get fechaAtencionFormateada() {
        if (!this.fechaAtencion) return null;
        return this.fechaAtencion.toLocaleString('es-MX', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    }

    get esAlarma() {
        const alarmasTypeIds = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
            130, 131, 132, 133, 134, 135, 584];
        return alarmasTypeIds.includes(this.type_id) ||
            this.description?.toLowerCase().includes('alarm');
    }

    get esRestauracion() {
        return this.description?.toLowerCase().includes('restore') ||
            this.description?.toLowerCase().includes('restauración');
    }

    get esMedicalAlarm() {
        return this.type_id === 584 ||
            this.description?.toLowerCase().includes('medical');
    }

    get prioridad() {
        if (this.type_id === 584) return 'alta';
        if (this.esAlarma) return 'alta';
        if (this.type_id >= 400 && this.type_id <= 499) return 'media';
        return 'baja';
    }

    get prioridadColor() {
        const colores = {
            'alta': '#e74c3c',
            'media': '#f39c12',
            'baja': '#3498db'
        };
        return colores[this.prioridad] || '#95a5a6';
    }

    get estadoBadge() {
        const estados = {
            'pendiente': { color: '#f39c12', icono: 'fa-clock', texto: 'Pendiente' },
            'atendido': { color: '#2ecc71', icono: 'fa-check-circle', texto: 'Atendido' },
            'ignorado': { color: '#95a5a6', icono: 'fa-ban', texto: 'Ignorado' }
        };
        return estados[this.estadoEvento] || estados['pendiente'];
    }

    // ========== MÉTODOS DE ATENCIÓN ==========

    // ========== REEMPLAZAR EN evento.js ==========
    async marcarComoAtendido(idUsuario, nombreUsuario, mensaje = '') {
        this.atendido = true;
        this.fechaAtencion = new Date();
        this.idUsuarioAtencion = idUsuario;
        this.nombreUsuarioAtencion = nombreUsuario;
        this.mensajeRespuesta = mensaje;
        this.estadoEvento = 'atendido';

        // Actualizar en Firestore
        await this._actualizarEnFirestore({
            atendido: true,
            fechaAtencion: serverTimestamp(),
            idUsuarioAtencion: idUsuario,
            nombreUsuarioAtencion: nombreUsuario,
            mensajeRespuesta: mensaje,
            estadoEvento: 'atendido',
            fechaActualizacion: serverTimestamp()
        });

        // Actualizar la notificación asociada
        await this._actualizarNotificacionAsociada();

        return true;
    }

    // ========== REEMPLAZAR EN evento.js ==========
    async marcarComoIgnorado(idUsuario, nombreUsuario, motivo = '') {
        this.atendido = false;
        this.fechaAtencion = new Date();
        this.idUsuarioAtencion = idUsuario;
        this.nombreUsuarioAtencion = nombreUsuario;
        this.mensajeRespuesta = motivo;
        this.estadoEvento = 'ignorado';

        // Actualizar en Firestore
        await this._actualizarEnFirestore({
            atendido: false,
            fechaAtencion: serverTimestamp(),
            idUsuarioAtencion: idUsuario,
            nombreUsuarioAtencion: nombreUsuario,
            mensajeRespuesta: motivo,
            estadoEvento: 'ignorado',
            fechaActualizacion: serverTimestamp()
        });

        // Actualizar la notificación asociada
        await this._actualizarNotificacionAsociada();

        return true;
    }

    async _actualizarEnFirestore(datos) {
        try {
            if (!this.id) throw new Error('El evento no tiene ID');

            const docRef = doc(db, "eventos", this.id);
            await consumo.registrarFirestoreActualizacion("eventos", this.id);
            await updateDoc(docRef, datos);
            return true;
        } catch (error) {
            console.error("❌ Error actualizando evento:", error);
            throw error;
        }
    }

    // ========== MÉTODOS ESTÁTICOS ==========

    static async obtenerPorEmailAsociado(emailAsociado, opciones = {}) {
        try {
            const {
                soloPendientes = false,
                limite = 500,
                ordenarPor = 'createdAt',
                orden = 'desc',
                fechaLimite = null
            } = opciones;

            const eventosRef = collection(db, "eventos");
            let restricciones = [where("email_asociado", "==", emailAsociado)];

            if (soloPendientes) {
                restricciones.push(where("estadoEvento", "==", "pendiente"));
            }

            // Filtrar por fecha límite si se especifica
            if (fechaLimite) {
                restricciones.push(where("createdAt", ">=", fechaLimite));
            }

            let q = query(
                eventosRef,
                ...restricciones,
                orderBy(ordenarPor, orden),
                limit(limite)
            );

            await consumo.registrarFirestoreLectura("eventos", `email: ${emailAsociado}`);

            const snapshot = await getDocs(q);
            const eventos = [];

            snapshot.forEach(doc => {
                eventos.push(new Evento(doc.id, {
                    ...doc.data(),
                    id: doc.id
                }));
            });

            return eventos;

        } catch (error) {
            console.error("❌ Error obteniendo eventos:", error);
            return [];
        }
    }

    static async obtenerPorOrganizacion(organizacionCamelCase, opciones = {}) {
        try {
            const cuentasPM = await CuentaPM.obtenerPorOrganizacion(organizacionCamelCase);

            if (!cuentasPM || cuentasPM.length === 0) {
                return [];
            }

            const emailsAsociados = cuentasPM.map(c => c.email).filter(email => email);

            if (emailsAsociados.length === 0) {
                return [];
            }

            let todosLosEventos = [];

            for (const email of emailsAsociados) {
                const eventosEmail = await this.obtenerPorEmailAsociado(email, opciones);
                todosLosEventos = [...todosLosEventos, ...eventosEmail];
            }

            // Ordenar por fecha (más recientes primero)
            todosLosEventos.sort((a, b) => {
                const fechaA = a.createdAt || new Date(0);
                const fechaB = b.createdAt || new Date(0);
                return fechaB - fechaA;
            });

            return todosLosEventos;

        } catch (error) {
            console.error("❌ Error obteniendo eventos por organización:", error);
            return [];
        }
    }

    static async obtenerPorId(id) {
        try {
            const docRef = doc(db, "eventos", id);
            await consumo.registrarFirestoreLectura("eventos", id);

            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return null;

            return new Evento(id, { ...docSnap.data(), id });
        } catch (error) {
            console.error("❌ Error obteniendo evento:", error);
            return null;
        }
    }

    static async obtenerEstadisticas(organizacionCamelCase) {
        try {
            const eventos = await this.obtenerPorOrganizacion(organizacionCamelCase, { limite: 1000 });

            const stats = {
                total: eventos.length,
                pendientes: eventos.filter(e => e.estadoEvento === 'pendiente').length,
                atendidos: eventos.filter(e => e.estadoEvento === 'atendido').length,
                ignorados: eventos.filter(e => e.estadoEvento === 'ignorado').length,
                alarmas: eventos.filter(e => e.esAlarma).length,
                medicalAlarms: eventos.filter(e => e.type_id === 584).length,
                porPanel: {},
                porEmail: {},
                porDia: {}
            };

            eventos.forEach(evento => {
                const panel = evento.panel_serial || 'Desconocido';
                stats.porPanel[panel] = (stats.porPanel[panel] || 0) + 1;

                const email = evento.email_asociado || 'Desconocido';
                stats.porEmail[email] = (stats.porEmail[email] || 0) + 1;

                if (evento.createdAt) {
                    const fecha = evento.createdAt.toISOString().split('T')[0];
                    stats.porDia[fecha] = (stats.porDia[fecha] || 0) + 1;
                }
            });

            return stats;

        } catch (error) {
            console.error("❌ Error obteniendo estadísticas:", error);
            return null;
        }
    }

    // ========== REEMPLAZAR ESTA FUNCIÓN EN evento.js ==========
    static escucharEventosEnTiempoReal(organizacionCamelCase, onNuevoEvento, onError, fechaInicio = null) {
        return {
            subscribe: async () => {
                try {
                    const cuentasPM = await CuentaPM.obtenerPorOrganizacion(organizacionCamelCase);
                    const emailsAsociados = cuentasPM.map(c => c.email).filter(email => email);

                    if (emailsAsociados.length === 0) {
                        console.warn('⚠️ No hay emails asociados para escuchar eventos');
                        return () => { };
                    }

                    const eventosRef = collection(db, "eventos");

                    const constraints = [
                        where("email_asociado", "in", emailsAsociados.slice(0, 10)),
                        where("estadoEvento", "==", "pendiente"),
                        orderBy("createdAt", "desc"),
                        limit(100)
                    ];

                    // Filtro opcional para evitar recibir eventos antiguos
                    if (fechaInicio) {
                        constraints.splice(2, 0, where("createdAt", ">=", fechaInicio));
                    }

                    const q = query(eventosRef, ...constraints);

                    const unsubscribe = onSnapshot(q,
                        (snapshot) => {
                            snapshot.docChanges().forEach((change) => {
                                if (change.type === "added") {
                                    const doc = change.doc;
                                    const data = doc.data();

                                    if (!emailsAsociados.includes(data.email_asociado)) return;

                                    const evento = new Evento(doc.id, { ...data, id: doc.id });

                                    if (evento.estadoEvento === 'pendiente') {
                                        console.log(`🆕 Nuevo evento pendiente: ${evento.id}`);
                                        onNuevoEvento(evento);
                                    }
                                }
                            });
                        },
                        (error) => {
                            console.error('❌ Error en onSnapshot:', error);
                            if (onError) onError(error);
                        }
                    );

                    return unsubscribe;
                } catch (error) {
                    console.error('❌ Error iniciando escucha:', error);
                    return () => { };
                }
            }
        };
    }

    static async obtenerEventosPendientes(organizacionCamelCase, limite = 200, fechaLimite = null) {
        try {
            const cuentasPM = await CuentaPM.obtenerPorOrganizacion(organizacionCamelCase);
            const emailsAsociados = cuentasPM.map(c => c.email).filter(email => email);

            if (emailsAsociados.length === 0) return [];

            const todosLosEventos = [];

            for (const email of emailsAsociados) {
                const eventos = await this.obtenerPorEmailAsociado(email, {
                    soloPendientes: true,
                    limite: limite,
                    fechaLimite: fechaLimite
                });
                todosLosEventos.push(...eventos);
            }

            // Ordenar por fecha (más recientes primero)
            todosLosEventos.sort((a, b) => {
                const fechaA = a.createdAt || new Date(0);
                const fechaB = b.createdAt || new Date(0);
                return fechaB - fechaA;
            });

            return todosLosEventos.slice(0, limite);

        } catch (error) {
            console.error('❌ Error obteniendo eventos pendientes:', error);
            return [];
        }
    }

    static async existeNotificacionParaEvento(eventoId, organizacionCamelCase) {
        try {
            if (!eventoId || !organizacionCamelCase) return false;

            const collectionName = `notificaciones_${organizacionCamelCase}`;
            const notificacionesRef = collection(db, collectionName);

            const q = query(
                notificacionesRef,
                where("eventId", "==", eventoId),
                limit(1)
            );

            const snapshot = await getDocs(q);
            return !snapshot.empty;

        } catch (error) {
            console.error('❌ Error verificando existencia de notificación:', error);
            return false;
        }
    }

    // evento.js - dentro de la clase Evento
    async _actualizarNotificacionAsociada() {
        try {
            const organizacion = await this._obtenerOrganizacionDesdeEmail();
            if (!organizacion) {
                console.warn('⚠️ No se pudo determinar la organización para actualizar notificación');
                return;
            }

            const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
            const manager = new NotificacionAreaManager();

            // 1. Actualizar el contenido de la notificación (estado, mensaje, etc.)
            await manager.actualizarNotificacionEvento(this.id, organizacion, {
                atendido: this.atendido,
                idUsuarioAtencion: this.idUsuarioAtencion,
                nombreUsuarioAtencion: this.nombreUsuarioAtencion,
                mensajeRespuesta: this.mensajeRespuesta,
                estadoEvento: this.estadoEvento
            });

            // 2. Buscar el ID de la notificación por eventId
            const collectionName = `notificaciones_${organizacion}`;
            const notifRef = collection(db, collectionName);
            const q = query(notifRef, where("eventId", "==", this.id), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const notificacionId = snapshot.docs[0].id;

                // 3. Eliminar la notificación para TODOS los usuarios del área de Seguridad
                // (esto limpia los subdocumentos de cada usuario y vacía usuariosIds)
                await manager.eliminarNotificacionParaArea(
                    notificacionId,
                    'Seguridad',           // los eventos siempre van al área de Seguridad
                    organizacion
                );
                console.log(`✅ Notificación ${notificacionId} eliminada para toda el área de Seguridad`);
            } else {
                console.warn(`⚠️ No se encontró notificación para el evento ${this.id}`);
            }

        } catch (error) {
            console.error('❌ Error actualizando notificación asociada:', error);
        }
    }

    /**
     * Obtiene la organización desde el email asociado
     */
    async _obtenerOrganizacionDesdeEmail() {
        try {
            if (!this.email_asociado) return null;

            // Buscar en CuentaPM
            const cuentasRef = collection(db, "cuentas_tecnicas_pm"); // ← CORRECCIÓN AQUÍ
            const q = query(cuentasRef, where("email", "==", this.email_asociado), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                return data.organizacionCamelCase || data.organizacion || data.empresa || null;
            }

            // Si no se encuentra, intentar obtener del usuario actual
            try {
                const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                if (userData && userData.organizacionCamelCase) {
                    return userData.organizacionCamelCase;
                }
            } catch (e) { /* silencioso */ }

            return null;
        } catch (error) {
            console.error('❌ Error obteniendo organización:', error);
            return null;
        }
    }

    /**
     * Obtiene eventos paginados para una organización
     */
    static async obtenerEventosPaginados(organizacionCamelCase, opciones = {}) {
        const tiempoInicio = performance.now();

        try {
            const {
                filtros = {},
                pagina = 1,
                itemsPorPagina = 15,
                ultimoDocumento = null,
                soloPendientes = false,
                fechaLimite = null
            } = opciones;

            if (!organizacionCamelCase) {
                return {
                    eventos: [],
                    total: 0,
                    pagina: 1,
                    totalPaginas: 0,
                    ultimoDocumento: null,
                    itemsPorPagina
                };
            }

            // Obtener emails asociados
            const cuentasPM = await CuentaPM.obtenerPorOrganizacion(organizacionCamelCase);
            const emailsAsociados = cuentasPM.map(c => c.email).filter(email => email);

            if (emailsAsociados.length === 0) {
                return {
                    eventos: [],
                    total: 0,
                    pagina: 1,
                    totalPaginas: 0,
                    ultimoDocumento: null,
                    itemsPorPagina
                };
            }

            const eventosRef = collection(db, "eventos");

            // Construir constraints
            const constraints = [];

            // Filtro por emails (máximo 10 por limitación de Firestore)
            constraints.push(where("email_asociado", "in", emailsAsociados.slice(0, 10)));

            // Filtro por estado
            if (filtros.estado === 'pendiente') {
                constraints.push(where("estadoEvento", "==", "pendiente"));
            } else if (filtros.estado === 'atendido') {
                constraints.push(where("estadoEvento", "==", "atendido"));
            } else if (filtros.estado === 'ignorado') {
                constraints.push(where("estadoEvento", "==", "ignorado"));
            }

            // Filtro por fecha límite (eventos recientes)
            if (fechaLimite) {
                constraints.push(where("createdAt", ">=", fechaLimite));
            }

            // Filtro por tipo de alarma
            if (filtros.esAlarma === true) {
                // Usar type_id para alarmas conocidas
                constraints.push(where("type_id", "in", [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 130, 131, 132, 133, 134, 135, 584]));
            }

            // Ordenar por fecha descendente
            constraints.push(orderBy("createdAt", "desc"));

            // ========== CONTAR TOTAL (usando el índice existente) ==========
            let total = 0;
            try {
                const countQuery = query(eventosRef, ...constraints);
                const countSnapshot = await getCountFromServer(countQuery);
                total = countSnapshot.data().count;
            } catch (countError) {
                console.warn('⚠️ Error en conteo:', countError);
                total = 0;
            }

            if (total === 0) {
                return {
                    eventos: [],
                    total: 0,
                    pagina,
                    totalPaginas: 0,
                    ultimoDocumento: null,
                    itemsPorPagina
                };
            }

            // ========== OBTENER DOCUMENTOS PAGINADOS ==========
            let paginatedQuery;

            if (pagina === 1 || !ultimoDocumento) {
                paginatedQuery = query(
                    eventosRef,
                    ...constraints,
                    limit(itemsPorPagina)
                );
            } else {
                paginatedQuery = query(
                    eventosRef,
                    ...constraints,
                    startAfter(ultimoDocumento),
                    limit(itemsPorPagina)
                );
            }

            await consumo.registrarFirestoreLectura("eventos", `pagina_${pagina}`);
            const snapshot = await getDocs(paginatedQuery);

            const eventos = [];
            let nuevoUltimoDocumento = null;

            if (!snapshot.empty) {
                nuevoUltimoDocumento = snapshot.docs[snapshot.docs.length - 1];

                snapshot.forEach(doc => {
                    eventos.push(new Evento(doc.id, {
                        ...doc.data(),
                        id: doc.id
                    }));
                });
            }

            const tiempoFin = performance.now();
            console.log(`⚡ Eventos cargados: ${(tiempoFin - tiempoInicio).toFixed(0)}ms | Página ${pagina} | Total: ${total}`);

            return {
                eventos,
                total,
                pagina,
                totalPaginas: Math.ceil(total / itemsPorPagina),
                ultimoDocumento: nuevoUltimoDocumento,
                itemsPorPagina
            };

        } catch (error) {
            console.error('❌ Error en obtenerEventosPaginados:', error);
            return {
                eventos: [],
                total: 0,
                pagina: 1,
                totalPaginas: 0,
                ultimoDocumento: null,
                itemsPorPagina
            };
        }
    }

    /**
     * Escucha SOLO nuevos eventos en tiempo real
     */
    static escucharNuevosEventos(organizacionCamelCase, onNuevoEvento, onError) {
        return {
            subscribe: async () => {
                try {
                    const cuentasPM = await CuentaPM.obtenerPorOrganizacion(organizacionCamelCase);
                    const emailsAsociados = cuentasPM.map(c => c.email).filter(email => email);

                    if (emailsAsociados.length === 0) {
                        console.warn('⚠️ No hay emails para escuchar');
                        return () => { };
                    }

                    const eventosRef = collection(db, "eventos");

                    // Solo eventos pendientes y recientes
                    const q = query(
                        eventosRef,
                        where("email_asociado", "in", emailsAsociados.slice(0, 10)),
                        where("estadoEvento", "==", "pendiente"),
                        orderBy("createdAt", "desc"),
                        limit(20)
                    );

                    const unsubscribe = onSnapshot(q, (snapshot) => {
                        snapshot.docChanges().forEach((change) => {
                            // SOLO documentos NUEVOS (added)
                            if (change.type === "added") {
                                const doc = change.doc;
                                const data = doc.data();

                                if (!emailsAsociados.includes(data.email_asociado)) {
                                    return;
                                }

                                const evento = new Evento(doc.id, { ...data, id: doc.id });

                                if (evento.estadoEvento === 'pendiente') {
                                    console.log(`🆕 Nuevo evento en tiempo real: ${evento.id}`);
                                    onNuevoEvento(evento);
                                }
                            }
                        });
                    }, (error) => {
                        console.error('❌ Error en escucha:', error);
                        if (onError) onError(error);
                    });

                    return unsubscribe;

                } catch (error) {
                    console.error('❌ Error iniciando escucha:', error);
                    return () => { };
                }
            }
        };
    }
}

export { Evento };