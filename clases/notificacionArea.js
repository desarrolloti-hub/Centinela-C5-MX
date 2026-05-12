// notificacionArea.js - VERSIÓN QUE ELIMINA NOTIFICACIONES DESPUÉS DE VERLAS
// CORREGIDO: Orden de notificaciones por fecha (más recientes primero)
// NUEVO: Método paginado con filtros para reducir consumo

import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    getCountFromServer,
    serverTimestamp,
    increment,
    writeBatch,
    deleteDoc,
    arrayRemove,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from "/config/firebase-config.js";
import consumo from "/clases/consumoFirebase.js";
import { CLOUD_FUNCTION_BASE_URL } from "/config/urlCloudFunction.js";

class NotificacionArea {
    constructor(id, data) {
        this.id = id;
        this.titulo = data.titulo || "";
        this.mensaje = data.mensaje || "";
        this.tipo = data.tipo || "canalizacion";
        this.fecha = data.fecha ? this._convertirFecha(data.fecha) : new Date();
        this.organizacionCamelCase = data.organizacionCamelCase || "";
        this.remitenteId = data.remitenteId || "";
        this.remitenteNombre = data.remitenteNombre || "";

        this.incidenciaId = data.incidenciaId || "";
        this.incidenciaTitulo = data.incidenciaTitulo || "";
        this.sucursalId = data.sucursalId || "";
        this.sucursalNombre = data.sucursalNombre || "";
        this.categoriaId = data.categoriaId || "";
        this.categoriaNombre = data.categoriaNombre || "";
        this.nivelRiesgo = data.nivelRiesgo || "";

        this.areasIds = data.areasIds || [];
        this.areasDestino = data.areasDestino || [];

        this.totalUsuarios = data.totalUsuarios || 0;
        this.leidas = data.leidas || 0;

        this.urlDestino = data.urlDestino || "";

        this.detalles = data.detalles || {};
        this.prioridad = data.prioridad || "normal";
        this.icono = data.icono || "fa-bell";
        this.color = data.color || "#007bff";
        this.usuariosIds = data.usuariosIds || [];

        this.leida = data.leida || false;
        this.fechaLectura = data.fechaLectura || null;

        this.eventId = data.eventId || data.detalles?.eventId || null;
        this.panelSerial = data.panelSerial || data.detalles?.panel_serial || null;
        this.panelAlias = data.panelAlias || data.detalles?.panel_alias || null;
        this.eventDescription =
            data.eventDescription || data.detalles?.description || null;
        this.typeId = data.typeId || data.detalles?.type_id || null;
        this.esAlarma = data.esAlarma || data.detalles?.esAlarma || false;
        this.esMedicalAlarm =
            data.esMedicalAlarm || data.detalles?.esMedicalAlarm || false;
        this.fechaEvento =
            data.detalles?.fechaEvento || data.detalles?.createdAt || null;
        this.fechaCreacion = data.fechaCreacion || null;
    }

    _convertirFecha(fecha) {
        if (!fecha) return new Date();
        if (fecha && typeof fecha.toDate === "function") return fecha.toDate();
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === "string") return new Date(fecha);
        if (fecha && fecha._seconds) return new Date(fecha._seconds * 1000);
        return new Date();
    }

    getTiempoRelativo() {
        if (!this.fecha) return "";

        const ahora = new Date();
        const diffMs = ahora - this.fecha;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHoras = Math.floor(diffMs / 3600000);
        const diffDias = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return "Ahora mismo";
        if (diffMin < 60)
            return `Hace ${diffMin} ${diffMin === 1 ? "minuto" : "minutos"}`;
        if (diffHoras < 24)
            return `Hace ${diffHoras} ${diffHoras === 1 ? "hora" : "horas"}`;
        if (diffDias < 7)
            return `Hace ${diffDias} ${diffDias === 1 ? "día" : "días"}`;

        return this.fecha.toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    getIcono() {
        if (this.esMedicalAlarm || this.typeId === 584) return "fa-heartbeat";
        if (this.esAlarma || this.tipo === "alarma")
            return "fa-exclamation-triangle";
        if (this.tipo === "evento_monitoreo") return "fa-shield-alt";

        const iconos = {
            canalizacion: "fa-share-alt",
            comentario: "fa-comment",
            asignacion: "fa-user-check",
            resolucion: "fa-check-circle",
            vencimiento: "fa-clock",
            urgente: "fa-exclamation-triangle",
            monitoreo: "fa-video",
        };
        return iconos[this.tipo] || this.icono || "fa-bell";
    }

    getColor() {
        if (this.esMedicalAlarm || this.typeId === 584) return "#e74c3c";
        if (this.esAlarma || this.tipo === "alarma") return "#e67e22";
        if (this.tipo === "evento_monitoreo") return "#3498db";

        const colores = {
            canalizacion: "#28a745",
            comentario: "#17a2b8",
            asignacion: "#ffc107",
            resolucion: "#28a745",
            vencimiento: "#dc3545",
            urgente: "#dc3545",
            monitoreo: "#00cfff",
        };
        return colores[this.tipo] || this.color || "#6c757d";
    }

    toUI() {
        return {
            id: this.id,
            titulo: this.titulo,
            mensaje: this.mensaje,
            tipo: this.tipo,
            fecha: this.fecha,
            tiempoRelativo: this.getTiempoRelativo(),
            icono: this.getIcono(),
            color: this.getColor(),
            incidenciaId: this.incidenciaId,
            incidenciaTitulo: this.incidenciaTitulo,
            sucursalNombre: this.sucursalNombre,
            nivelRiesgo: this.nivelRiesgo,
            areasIds: this.areasIds,
            areasDestino: this.areasDestino,
            totalUsuarios: this.totalUsuarios,
            leidas: this.leidas,
            leida: this.leida,
            fechaLectura: this.fechaLectura,
            remitenteNombre: this.remitenteNombre,
            urlDestino:
                this.urlDestino ||
                (this.incidenciaId
                    ? `../verIncidencias/verIncidencias.html?id=${this.incidenciaId}`
                    : "#"),
            prioridad: this.prioridad,
            detalles: this.detalles,
            eventId: this.eventId,
            panelSerial: this.panelSerial,
            panelAlias: this.panelAlias,
            eventDescription: this.eventDescription,
            typeId: this.typeId,
            esAlarma: this.esAlarma,
            esMedicalAlarm: this.esMedicalAlarm,
        };
    }
}

class NotificacionAreaManager {
    constructor() {
        this.usuarioActual = null;
        this.functionUrl = `${CLOUD_FUNCTION_BASE_URL}sendPushNotification`;
        this.functionUrlV2 = "https://sendpushnotification-5orj5w7mha-uc.a.run.app";
        this._initUsuario();
    }

    _initUsuario() {
        try {
            const userData = JSON.parse(localStorage.getItem("userData") || "{}");
            if (userData && userData.id) {
                this.usuarioActual = {
                    id: userData.id,
                    uid: userData.id,
                    nombreCompleto: userData.nombreCompleto || "Usuario",
                    correo: userData.email || userData.correo || "",
                    organizacionCamelCase: userData.organizacionCamelCase || "",
                    rol: (userData.rol || "").toLowerCase(),
                };
            }
        } catch (error) {
            // Error silencioso
        }
    }

    _getCollectionName(organizacionCamelCase) {
        return `notificaciones_${organizacionCamelCase}`;
    }

    _getUserNotificacionesCollectionName(organizacionCamelCase) {
        return `usuarios_notificaciones_${organizacionCamelCase}`;
    }

    _generarNotificacionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `not_${timestamp}_${random}`;
    }

    async _getUsuariosPorAreaId(areaId, organizacionCamelCase) {
        try {
            if (!areaId) return [];

            const colaboradoresCollection = `colaboradores_${organizacionCamelCase}`;
            const colabRef = collection(db, colaboradoresCollection);

            const q = query(
                colabRef,
                where("areaAsignadaId", "==", areaId),
                where("status", "==", true),
            );

            await consumo.registrarFirestoreLectura(
                colaboradoresCollection,
                `usuarios por área: ${areaId}`,
            );

            const snapshot = await getDocs(q);
            const usuarios = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                usuarios.push({
                    id: doc.id,
                    nombreCompleto: data.nombreCompleto || "Usuario",
                    correo: data.correoElectronico || "",
                    dispositivos: data.dispositivos || [],
                    areaAsignadaId: data.areaAsignadaId,
                    esAdmin: false,
                });
            });

            return usuarios;
        } catch (error) {
            return [];
        }
    }

    async _getUsuariosPorNombreArea(nombreArea, organizacionCamelCase) {
        try {
            if (!nombreArea || !organizacionCamelCase) return [];

            const cachedId = this._getAreaSeguridadIdDesdeLocalStorage(
                organizacionCamelCase,
            );

            if (cachedId) {
                return await this._getUsuariosPorAreaId(
                    cachedId,
                    organizacionCamelCase,
                );
            }

            const areasRef = collection(db, `areas_${organizacionCamelCase}`);
            const q = query(
                areasRef,
                where("nombreArea", "==", nombreArea),
                limit(1),
            );
            const snapshot = await getDocs(q);

            let areaId = null;

            if (!snapshot.empty) {
                areaId = snapshot.docs[0].id;
            } else {
                const todasAreasSnapshot = await getDocs(areasRef);
                for (const doc of todasAreasSnapshot.docs) {
                    const data = doc.data();
                    if (
                        data.nombreArea &&
                        data.nombreArea.toLowerCase() === nombreArea.toLowerCase()
                    ) {
                        areaId = doc.id;
                        break;
                    }
                }
            }

            if (!areaId) {
                return [];
            }

            this._setAreaSeguridadIdEnCache(organizacionCamelCase, areaId);
            return await this._getUsuariosPorAreaId(areaId, organizacionCamelCase);
        } catch (error) {
            return [];
        }
    }

    _extraerTokensActivos(dispositivos) {
        if (!dispositivos || !Array.isArray(dispositivos)) return [];
        return dispositivos
            .filter((d) => d.token && d.enabled !== false)
            .map((d) => d.token);
    }

    async _getUsuariosPorMultiplesAreas(areasIds, organizacionCamelCase) {
        try {
            if (!areasIds || areasIds.length === 0) return [];

            const todosUsuarios = [];
            const idsVistos = new Set();

            const promises = areasIds.map((areaId) =>
                this._getUsuariosPorAreaId(areaId, organizacionCamelCase),
            );

            const resultados = await Promise.all(promises);

            for (const usuariosArea of resultados) {
                for (const usuario of usuariosArea) {
                    if (!idsVistos.has(usuario.id)) {
                        idsVistos.add(usuario.id);
                        todosUsuarios.push(usuario);
                    }
                }
            }

            return todosUsuarios;
        } catch (error) {
            return [];
        }
    }

    async _getAdministradores(organizacionCamelCase) {
        try {
            const adminRef = collection(db, "administradores");

            const q = query(adminRef, where("status", "==", true));

            await consumo.registrarFirestoreLectura(
                "administradores",
                "obtener_administradores",
            );

            const snapshot = await getDocs(q);
            const administradores = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                const adminOrgCamelCase =
                    data.organizacionCamelCase ||
                    this._generarCamelCase(data.organizacion);

                if (adminOrgCamelCase === organizacionCamelCase) {
                    administradores.push({
                        id: doc.id,
                        nombreCompleto: data.nombreCompleto || "Administrador",
                        correo: data.correoElectronico || data.email || "",
                        dispositivos: data.dispositivos || [],
                        esAdmin: true,
                        rol: "administrador",
                    });
                }
            });

            return administradores;
        } catch (error) {
            console.error("Error obteniendo administradores:", error);
            return [];
        }
    }

    _generarCamelCase(texto) {
        if (!texto || typeof texto !== "string") return "";
        return texto
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, "");
    }

    async _enviarNotificacionesPush(usuarios, notificacionData) {
        try {
            let enviados = 0;
            let totalNotificacionesPush = 0;
            let usuariosExitosos = 0;

            for (const usuario of usuarios) {
                try {
                    const tokens = this._extraerTokensActivos(usuario.dispositivos);

                    if (tokens.length === 0) continue;

                    const payload = {
                        userId: usuario.id,
                        userType: usuario.esAdmin ? "administrador" : "colaborador",
                        organizacionCamelCase: notificacionData.organizacionCamelCase,
                        title: notificacionData.titulo,
                        body: notificacionData.mensaje,
                        url: notificacionData.urlDestino,
                        senderToken: notificacionData.remitenteId || "sistema",
                        tokens: tokens,
                        data: {
                            incidenciaId: notificacionData.incidenciaId,
                            tipo: notificacionData.tipo,
                            nivelRiesgo: notificacionData.nivelRiesgo,
                            notificacionId: notificacionData.id,
                            areasIds: notificacionData.areasIds,
                            eventId: notificacionData.eventId,
                            panelSerial: notificacionData.panelSerial,
                            esAlarma: notificacionData.esAlarma,
                        },
                    };

                    let response = await fetch(this.functionUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    });

                    if (!response.ok && this.functionUrlV2) {
                        response = await fetch(this.functionUrlV2, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                        });
                    }

                    if (response.ok) {
                        enviados++;
                        usuariosExitosos++;
                        totalNotificacionesPush += tokens.length;
                    }
                } catch (error) {
                    // Error silencioso
                }

                await new Promise((r) => setTimeout(r, 100));
            }

            if (totalNotificacionesPush > 0) {
                await consumo.registrarNotificacionesPush(
                    totalNotificacionesPush,
                    usuariosExitosos,
                    "sendPushNotification",
                    {
                        incidenciaId: notificacionData.incidenciaId,
                        totalUsuariosPotenciales: usuarios.length,
                        tipoNotificacion: notificacionData.tipo,
                    },
                );
            }

            return {
                success: enviados > 0,
                enviados: usuariosExitosos,
                total: usuarios.length,
                notificacionesPush: totalNotificacionesPush,
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async notificarEventoMonitoreo({ evento, organizacionCamelCase, enviarPush = true }) {
        const tiempoInicio = performance.now();

        try {
            if (!organizacionCamelCase) {
                return { success: false, error: "organizacionCamelCase requerido" };
            }
            if (!evento || !evento.id) {
                return { success: false, error: "Evento inválido" };
            }
            if (evento.estadoEvento !== "pendiente") {
                return { success: true, notificacionCreada: false, mensaje: "Evento ya no está pendiente" };
            }

            const notificacionId = `event_${evento.id}`;               // ID determinista
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const notificacionRef = doc(db, collectionName, notificacionId);

            // ========== Transacción atómica: solo crea si no existe ==========
            const creada = await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(notificacionRef);
                if (docSnap.exists()) {
                    return false;           // ya existe, no hacer nada
                }

                // Construir datos de la notificación
                const titulo = this._generarTituloEvento(evento);
                const mensaje = this._generarMensajeEvento(evento);
                const areaSeguridadId = "seguridad"; // se usará más tarde el real, pero aquí temporal

                const notificacionData = {
                    id: notificacionId,
                    titulo: titulo,
                    mensaje: mensaje,
                    tipo: evento.esAlarma ? "alarma" : "evento_monitoreo",
                    fecha: serverTimestamp(),
                    organizacionCamelCase: organizacionCamelCase,
                    remitenteId: "sistema_monitoreo",
                    remitenteNombre: "Sistema de Monitoreo",
                    prioridad: evento.prioridad === "alta" ? "alta" : "normal",
                    incidenciaId: null,
                    incidenciaTitulo: null,
                    sucursalId: null,
                    sucursalNombre: null,
                    categoriaId: null,
                    categoriaNombre: null,
                    nivelRiesgo: evento.prioridad,
                    areasDestino: [{ id: areaSeguridadId, nombre: "Seguridad" }],
                    areasIds: [areaSeguridadId],
                    totalUsuarios: 0,
                    totalAdministradores: 0,
                    leidas: 0,
                    usuariosIds: [],
                    detalles: {
                        eventId: evento.id,
                        panel_serial: evento.panel_serial,
                        panel_alias: evento.panel_alias,
                        description: evento.description,
                        type_id: evento.type_id,
                        esAlarma: evento.esAlarma,
                        esMedicalAlarm: evento.type_id === 584,
                        email_asociado: evento.email_asociado,
                        zone: evento.zone,
                        zone_name: evento.zone_name,
                        partitions: evento.partitions,
                        fechaEvento: evento.createdAt || new Date(),
                        createdAt: evento.createdAt
                    },
                    eventId: evento.id,
                    panelSerial: evento.panel_serial,
                    panelAlias: evento.panel_alias,
                    eventDescription: evento.description,
                    typeId: evento.type_id,
                    esAlarma: evento.esAlarma,
                    esMedicalAlarm: evento.type_id === 584,
                    icono: evento.esAlarma ? "fa-exclamation-triangle" : "fa-shield-alt",
                    color: evento.prioridadColor || "#3498db",
                    urlDestino: "#",
                    fechaCreacion: serverTimestamp(),
                    atendido: false,
                    idUsuarioAtencion: null,
                    nombreUsuarioAtencion: null,
                    fechaAtencion: null,
                    mensajeRespuesta: null,
                    estadoEvento: 'pendiente'
                };

                transaction.set(notificacionRef, notificacionData);
                return true;
            });

            if (!creada) {
                return { success: true, notificacionCreada: false, mensaje: "Ya existía" };
            }

            // ========== Obtener usuarios destinatarios (ahora seguro tras creación) ==========
            const [usuariosSeguridad, administradores] = await Promise.all([
                this._getUsuariosSeguridadRapido(organizacionCamelCase),
                this._getAdministradoresCache(organizacionCamelCase)
            ]);
            const todosDestinatarios = [...usuariosSeguridad, ...administradores];
            const idsUnicos = new Set();
            const destUnicos = [];
            const usuariosIds = [];
            for (const d of todosDestinatarios) {
                if (!idsUnicos.has(d.id)) {
                    idsUnicos.add(d.id);
                    destUnicos.push(d);
                    usuariosIds.push(d.id);
                }
            }

            // ========== Actualizar la notificación con usuarios reales (merge) ==========
            const areaSeguridadReal = usuariosSeguridad.length > 0 ? usuariosSeguridad[0].areaAsignadaId : "seguridad";
            await updateDoc(notificacionRef, {
                usuariosIds: usuariosIds,
                totalUsuarios: usuariosSeguridad.length,
                totalAdministradores: administradores.length,
                areasIds: [areaSeguridadReal],
                areasDestino: [{ id: areaSeguridadReal, nombre: "Seguridad" }]
            });

            // ========== Crear índices de usuario en paralelo ==========
            if (destUnicos.length > 0) {
                this._crearIndicesUsuariosRapido(notificacionId, destUnicos, organizacionCamelCase)
                    .catch(e => console.warn('⚠️ Error creando índices:', e));
            }

            // ========== Enviar push (reconstruimos el objeto de datos) ==========
            if (enviarPush && destUnicos.length > 0) {
                const pushData = {
                    id: notificacionId,
                    titulo: this._generarTituloEvento(evento),
                    mensaje: this._generarMensajeEvento(evento),
                    tipo: evento.esAlarma ? "alarma" : "evento_monitoreo",
                    organizacionCamelCase: organizacionCamelCase,
                    remitenteId: "sistema_monitoreo",
                    remitenteNombre: "Sistema de Monitoreo",
                    prioridad: evento.prioridad,
                    urlDestino: "#",
                    eventId: evento.id,
                    panelSerial: evento.panel_serial,
                    esAlarma: evento.esAlarma,
                    areasIds: [areaSeguridadReal],
                    incidenciaId: null,
                    nivelRiesgo: evento.prioridad
                };
                this._enviarNotificacionesPush(destUnicos, pushData)
                    .catch(e => console.warn('⚠️ Error enviando push:', e));
            }

            const tiempoFin = performance.now();

            return {
                success: true,
                notificacionId,
                totalDestinatarios: destUnicos.length,
                totalSeguridad: usuariosSeguridad.length,
                totalAdministradores: administradores.length,
                tiempoMs: tiempoFin - tiempoInicio
            };

        } catch (error) {
            console.error("❌ Error en notificarEventoMonitoreo:", error);
            return { success: false, error: error.message };
        }
    }

    _generarTituloEvento(evento) {
        if (evento.type_id === 584) {
            return "🚨 ALARMA MÉDICA";
        } else if (evento.esAlarma) {
            return "🔔 NUEVA ALARMA";
        } else if (evento.esRestauracion) {
            return "✅ Restauración de Alarma";
        } else {
            return "📋 Evento de Monitoreo";
        }
    }

    _generarMensajeEvento(evento) {
        let mensaje = evento.description || "Evento recibido";

        if (evento.panel_alias) {
            mensaje += ` - Panel: ${evento.panel_alias}`;
        } else if (evento.panel_serial) {
            mensaje += ` - Panel: ${evento.panel_serial}`;
        }

        if (evento.zone_name) {
            mensaje += ` (${evento.zone_name})`;
        }

        return mensaje;
    }

    async _crearIndicesUsuariosRapido(notificacionId, usuarios, organizacionCamelCase) {
        try {
            if (!usuarios || usuarios.length === 0) return;

            const batch = writeBatch(db);
            const userNotifCollectionName = this._getUserNotificacionesCollectionName(organizacionCamelCase);

            for (const usuario of usuarios) {
                const userNotifRef = doc(db, userNotifCollectionName, usuario.id);

                // Usar merge: true para no sobrescribir otras notificaciones
                batch.set(userNotifRef, {
                    [`notificaciones.${notificacionId}`]: {
                        leida: false,
                        fechaRecepcion: serverTimestamp(),
                        fechaLectura: null
                    },
                    totalPendientes: increment(1),
                    ultimaActualizacion: serverTimestamp()
                }, { merge: true });
            }

            await batch.commit();
        } catch (error) {
            console.error("❌ Error creando índices de usuarios:", error);
            throw error;
        }
    }


    async marcarComoLeida(usuarioId, notificacionId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId || !notificacionId) return false;

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(organizacionCamelCase);
            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);

            const userNotifSnap = await getDoc(userNotifRef);
            if (!userNotifSnap.exists()) return false;

            const userData = userNotifSnap.data();
            const notificacionesMap = userData.notificaciones || {};
            const notificacionActual = notificacionesMap[notificacionId];

            if (!notificacionActual || notificacionActual.leida === true) {
                // Ya estaba leída, igual limpiamos el array por si acaso
                await this._removerUsuarioDeNotificacion(notificacionId, usuarioId, organizacionCamelCase);
                return true;
            }

            // 1. Eliminar del mapa del usuario
            const updatedNotificaciones = { ...notificacionesMap };
            delete updatedNotificaciones[notificacionId];
            const totalPendientes = Math.max(0, (userData.totalPendientes || 0) - 1);

            await updateDoc(userNotifRef, {
                notificaciones: updatedNotificaciones,
                totalPendientes: totalPendientes,
                ultimaActualizacion: serverTimestamp(),
            });

            // 2. Remover al usuario del arreglo usuariosIds en el documento global
            await this._removerUsuarioDeNotificacion(notificacionId, usuarioId, organizacionCamelCase);

            return true;
        } catch (error) {
            console.error("Error marcando notificación como leída:", error);
            return false;
        }
    }

    // Método auxiliar nuevo
    async _removerUsuarioDeNotificacion(notificacionId, usuarioId, organizacionCamelCase) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const notifRef = doc(db, collectionName, notificacionId);
            await updateDoc(notifRef, {
                usuariosIds: arrayRemove(usuarioId),
                leidas: increment(1) // si queremos llevar el conteo global de leídas
            });
        } catch (error) {
            console.warn('Error al remover usuario de usuariosIds:', error);
        }
    }

    async eliminarNotificacionParaArea(
        notificacionId,
        nombreArea,
        organizacionCamelCase,
    ) {
        try {
            if (!organizacionCamelCase || !notificacionId || !nombreArea) {
                return false;
            }

            const usuariosArea = await this._getUsuariosPorNombreArea(
                nombreArea,
                organizacionCamelCase,
            );
            const administradores = await this._getAdministradores(
                organizacionCamelCase,
            );

            const todosUsuarios = [...usuariosArea, ...administradores];
            const idsUnicos = new Set();
            const usuariosUnicos = [];

            for (const usuario of todosUsuarios) {
                if (!idsUnicos.has(usuario.id)) {
                    idsUnicos.add(usuario.id);
                    usuariosUnicos.push(usuario);
                }
            }

            if (usuariosUnicos.length === 0) {
                return true;
            }

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(
                organizacionCamelCase,
            );
            const batch = writeBatch(db);
            let operaciones = 0;
            let eliminados = 0;

            for (const usuario of usuariosUnicos) {
                const userNotifRef = doc(db, userNotifCollectionName, usuario.id);

                try {
                    const userNotifSnap = await getDoc(userNotifRef);

                    if (userNotifSnap.exists()) {
                        const userData = userNotifSnap.data();
                        const notificacionesMap = userData.notificaciones || {};

                        if (notificacionesMap[notificacionId]) {
                            const estabaLeida = notificacionesMap[notificacionId].leida;
                            const updatedNotificaciones = { ...notificacionesMap };
                            delete updatedNotificaciones[notificacionId];

                            const totalPendientesActual = userData.totalPendientes || 0;
                            const nuevoTotalPendientes = estabaLeida
                                ? totalPendientesActual
                                : Math.max(0, totalPendientesActual - 1);

                            batch.update(userNotifRef, {
                                notificaciones: updatedNotificaciones,
                                totalPendientes: nuevoTotalPendientes,
                                ultimaActualizacion: serverTimestamp(),
                            });

                            eliminados++;
                            operaciones++;
                        }
                    }
                } catch (error) {
                    // Error silencioso
                }

                if (operaciones >= 400) {
                    await batch.commit();
                    operaciones = 0;
                }
            }

            if (operaciones > 0) {
                await batch.commit();
            }

            try {
                const notificacionesCollectionName = this._getCollectionName(
                    organizacionCamelCase,
                );
                const notificacionRef = doc(
                    db,
                    notificacionesCollectionName,
                    notificacionId,
                );
                await updateDoc(notificacionRef, {
                    estadoNotificacion: "atendida",
                    fechaAtencion: serverTimestamp(),
                });
            } catch (error) {
                // Error silencioso
            }

            return true;
        } catch (error) {
            console.error("❌ Error en eliminarNotificacionParaArea:", error);
            return false;
        }
    }

    async marcarTodasComoLeidas(usuarioId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId) return false;

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(
                organizacionCamelCase,
            );
            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);

            const userNotifSnap = await getDoc(userNotifRef);

            if (!userNotifSnap.exists()) {
                return false;
            }

            const userData = userNotifSnap.data();
            const notificacionesMap = userData.notificaciones || {};

            const noLeidasIds = Object.keys(notificacionesMap).filter(
                (id) => !notificacionesMap[id].leida,
            );

            if (noLeidasIds.length === 0) {
                return true;
            }

            await updateDoc(userNotifRef, {
                notificaciones: {},
                totalPendientes: 0,
                ultimaActualizacion: serverTimestamp(),
            });

            const notificacionesCollectionName = this._getCollectionName(
                organizacionCamelCase,
            );
            for (const notifId of noLeidasIds) {
                try {
                    const notifRef = doc(db, notificacionesCollectionName, notifId);
                    await updateDoc(notifRef, {
                        leidas: increment(1),
                    });
                } catch (e) {
                    // Error silencioso
                }
            }

            return true;
        } catch (error) {
            console.error("Error marcando todas como leídas:", error);
            return false;
        }
    }

    // ========== AGREGAR ESTE MÉTODO EN notificacionArea.js ==========

    // Ubicación: Dentro de la clase NotificacionAreaManager
    // Colocar ANTES de obtenerNotificacionesPaginadas

    async obtenerNotificaciones(
        usuarioId,
        organizacionCamelCase,
        soloNoLeidas = false,
        limite = null,
    ) {
        try {
            if (!organizacionCamelCase || !usuarioId) return [];

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(
                organizacionCamelCase,
            );
            const notificacionesCollectionName = this._getCollectionName(
                organizacionCamelCase,
            );

            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);
            await consumo.registrarFirestoreLectura(
                userNotifCollectionName,
                usuarioId,
            );

            const userNotifSnap = await getDoc(userNotifRef);

            if (!userNotifSnap.exists()) {
                return [];
            }

            const userData = userNotifSnap.data();
            const notificacionesMap = userData.notificaciones || {};

            let notificacionesIds = Object.keys(notificacionesMap);

            if (soloNoLeidas) {
                notificacionesIds = notificacionesIds.filter(
                    (id) => !notificacionesMap[id]?.leida,
                );
            }

            if (notificacionesIds.length === 0) {
                return [];
            }

            const notificaciones = [];

            // Cargar en lotes de 10 (límite de Firestore para "in")
            for (let i = 0; i < notificacionesIds.length; i += 10) {
                const batchIds = notificacionesIds.slice(i, i + 10);

                const q = query(
                    collection(db, notificacionesCollectionName),
                    where("__name__", "in", batchIds),
                );

                await consumo.registrarFirestoreLectura(
                    notificacionesCollectionName,
                    `batch_${i}`,
                );

                const snapshot = await getDocs(q);

                snapshot.forEach((doc) => {
                    const notifData = doc.data();
                    const userNotifData = notificacionesMap[doc.id] || { leida: false };

                    notificaciones.push(
                        new NotificacionArea(doc.id, {
                            ...notifData,
                            leida: userNotifData.leida,
                            fechaLectura: userNotifData.fechaLectura,
                        }),
                    );
                });
            }

            // Ordenar por fecha (más recientes primero)
            notificaciones.sort((a, b) => {
                const fechaA = this._obtenerFechaRealNotificacion(a);
                const fechaB = this._obtenerFechaRealNotificacion(b);
                return fechaB - fechaA;
            });

            const notificacionesOrdenadas = limite
                ? notificaciones.slice(0, limite)
                : notificaciones;

            return notificacionesOrdenadas;
        } catch (error) {
            console.error("❌ Error obteniendo notificaciones:", error);
            return [];
        }
    }

    // ========== MÉTODO PRINCIPAL: PAGINACIÓN REAL CON ÍNDICES ==========
    async obtenerNotificacionesPaginadas(
        usuarioId,
        organizacionCamelCase,
        opciones = {},
    ) {
        const tiempoInicio = performance.now();

        try {
            if (!organizacionCamelCase || !usuarioId) {
                return {
                    notificaciones: [],
                    total: 0,
                    pagina: 1,
                    totalPaginas: 0,
                    itemsPorPagina: opciones.itemsPorPagina || 10,
                };
            }

            const { filtros = {}, pagina = 1, itemsPorPagina = 10 } = opciones;
            const notificacionesCollectionName = this._getCollectionName(
                organizacionCamelCase,
            );
            const userNotifCollectionName = this._getUserNotificacionesCollectionName(
                organizacionCamelCase,
            );

            // ========== CONSTRUIR CONSTRAINTS CON ÍNDICES REALES ==========
            const constraints = [];

            // Filtro principal por usuario (USA ÍNDICE usuariosIds)
            constraints.push(where("usuariosIds", "array-contains", usuarioId));
            constraints.push(orderBy("fecha", "desc"));

            // Filtros adicionales con índices compuestos
            if (filtros.tipo && filtros.tipo !== "todos") {
                if (filtros.tipo === "evento") {
                    constraints.push(where("tipo", "in", ["evento_monitoreo", "alarma"]));
                } else {
                    constraints.push(where("tipo", "==", filtros.tipo));
                }
            }

            if (filtros.nivelRiesgo && filtros.nivelRiesgo !== "todos") {
                constraints.push(where("nivelRiesgo", "==", filtros.nivelRiesgo));
            }

            if (filtros.subtipoEvento && filtros.subtipoEvento !== "todos") {
                if (filtros.subtipoEvento === "medical") {
                    constraints.push(where("esMedicalAlarm", "==", true));
                } else if (filtros.subtipoEvento === "alarma") {
                    constraints.push(where("esAlarma", "==", true));
                } else if (filtros.subtipoEvento === "evento") {
                    constraints.push(where("esAlarma", "==", false));
                }
            }

            // ========== OBTENER TOTAL CON getCountFromServer ==========
            let total = 0;
            try {
                const countQuery = query(
                    collection(db, notificacionesCollectionName),
                    ...constraints,
                );
                const countSnapshot = await getCountFromServer(countQuery);
                total = countSnapshot.data().count;
            } catch (countError) {
                console.warn(
                    "⚠️ Error en getCountFromServer, usando fallback:",
                    countError,
                );
                // Intentar fallback
                return await this._obtenerNotificacionesPaginadasFallback(
                    usuarioId,
                    organizacionCamelCase,
                    opciones,
                );
            }

            if (total === 0) {
                return {
                    notificaciones: [],
                    total: 0,
                    pagina,
                    totalPaginas: 0,
                    itemsPorPagina,
                };
            }

            // ========== OBTENER DOCUMENTOS CON PAGINACIÓN REAL ==========
            let paginatedQuery;

            if (pagina === 1) {
                paginatedQuery = query(
                    collection(db, notificacionesCollectionName),
                    ...constraints,
                    limit(itemsPorPagina),
                );
            } else {
                const skipAmount = (pagina - 1) * itemsPorPagina;
                const cursorQuery = query(
                    collection(db, notificacionesCollectionName),
                    ...constraints,
                    limit(skipAmount),
                );

                const cursorSnapshot = await getDocs(cursorQuery);

                if (cursorSnapshot.docs.length < skipAmount) {
                    return {
                        notificaciones: [],
                        total,
                        pagina,
                        totalPaginas: Math.ceil(total / itemsPorPagina),
                        itemsPorPagina,
                    };
                }

                const lastVisible = cursorSnapshot.docs[cursorSnapshot.docs.length - 1];
                paginatedQuery = query(
                    collection(db, notificacionesCollectionName),
                    ...constraints,
                    startAfter(lastVisible),
                    limit(itemsPorPagina),
                );
            }

            await consumo.registrarFirestoreLectura(
                notificacionesCollectionName,
                `pagina_${pagina}`,
            );
            const snapshot = await getDocs(paginatedQuery);

            // ========== OBTENER ESTADO DE LECTURA ==========
            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);
            const userNotifSnap = await getDoc(userNotifRef);
            const notificacionesMap = userNotifSnap.exists()
                ? userNotifSnap.data().notificaciones || {}
                : {};

            // ========== CONSTRUIR OBJETOS ==========
            const notificaciones = [];
            snapshot.forEach((doc) => {
                const notifData = doc.data();
                const userNotifData = notificacionesMap[doc.id] || { leida: false };
                notificaciones.push(
                    new NotificacionArea(doc.id, {
                        ...notifData,
                        leida: userNotifData.leida,
                        fechaLectura: userNotifData.fechaLectura,
                    }),
                );
            });

            const tiempoFin = performance.now();

            return {
                notificaciones,
                total,
                pagina,
                totalPaginas: Math.ceil(total / itemsPorPagina),
                itemsPorPagina,
            };
        } catch (error) {
            console.error("❌ Error en obtenerNotificacionesPaginadas:", error);
            return await this._obtenerNotificacionesPaginadasFallback(
                usuarioId,
                organizacionCamelCase,
                opciones,
            );
        }
    }

    /**
     * Limpia el caché antiguo para evitar errores de storage lleno
     */
    _limpiarCacheAntiguo() {
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (
                    key &&
                    (key.startsWith("notif_page_") || key.startsWith("notif_total_"))
                ) {
                    const timeKey = `${key}_time`;
                    const timeValue = localStorage.getItem(timeKey);
                    if (timeValue) {
                        const timeDiff = Date.now() - parseInt(timeValue);
                        if (timeDiff > 10 * 60 * 1000) {
                            // Más de 10 minutos
                            keysToRemove.push(key, timeKey);
                        }
                    }
                }
            }

            keysToRemove.forEach((key) => localStorage.removeItem(key));
        } catch (e) {
            // Si falla, limpiar todo el caché de notificaciones
            try {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith("notif_")) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach((key) => localStorage.removeItem(key));
            } catch (e2) {
                // Error silencioso
            }
        }
    }

    /**
     * MÉTODO DE FALLBACK OPTIMIZADO
     */
    async _obtenerNotificacionesPaginadasFallback(
        usuarioId,
        organizacionCamelCase,
        opciones = {},
    ) {
        try {
            const { filtros = {}, pagina = 1, itemsPorPagina = 10 } = opciones;

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(
                organizacionCamelCase,
            );
            const notificacionesCollectionName = this._getCollectionName(
                organizacionCamelCase,
            );

            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);
            const userNotifSnap = await getDoc(userNotifRef);

            if (!userNotifSnap.exists()) {
                return {
                    notificaciones: [],
                    total: 0,
                    pagina,
                    totalPaginas: 0,
                    itemsPorPagina,
                };
            }

            const userData = userNotifSnap.data();
            const notificacionesMap = userData.notificaciones || {};
            const todosLosIds = Object.keys(notificacionesMap);

            if (todosLosIds.length === 0) {
                return {
                    notificaciones: [],
                    total: 0,
                    pagina,
                    totalPaginas: 0,
                    itemsPorPagina,
                };
            }

            // Ordenar IDs por timestamp
            const idsOrdenados = todosLosIds.sort((a, b) => {
                const tsA = parseInt(a.split("_")[1]) || 0;
                const tsB = parseInt(b.split("_")[1]) || 0;
                return tsB - tsA;
            });

            // Calcular rango para la página actual
            const inicio = (pagina - 1) * itemsPorPagina;
            const fin = inicio + itemsPorPagina;
            const idsPagina = idsOrdenados.slice(inicio, fin);

            if (idsPagina.length === 0) {
                return {
                    notificaciones: [],
                    total: todosLosIds.length,
                    pagina,
                    totalPaginas: Math.ceil(todosLosIds.length / itemsPorPagina),
                    itemsPorPagina,
                };
            }

            // Cargar solo los documentos de esta página
            const q = query(
                collection(db, notificacionesCollectionName),
                where("__name__", "in", idsPagina),
                orderBy("fecha", "desc"),
            );

            const snapshot = await getDocs(q);
            const notificaciones = [];

            snapshot.forEach((doc) => {
                const notifData = doc.data();
                const userNotifData = notificacionesMap[doc.id] || { leida: false };

                notificaciones.push(
                    new NotificacionArea(doc.id, {
                        ...notifData,
                        leida: userNotifData.leida,
                        fechaLectura: userNotifData.fechaLectura,
                    }),
                );
            });

            // Aplicar filtros en memoria
            let notificacionesFiltradas = notificaciones;

            if (filtros.tipo && filtros.tipo !== "todos") {
                notificacionesFiltradas = notificacionesFiltradas.filter((n) => {
                    if (filtros.tipo === "evento") {
                        return n.tipo === "evento_monitoreo" || n.tipo === "alarma";
                    }
                    return n.tipo === filtros.tipo;
                });
            }

            if (filtros.nivelRiesgo && filtros.nivelRiesgo !== "todos") {
                notificacionesFiltradas = notificacionesFiltradas.filter(
                    (n) => n.nivelRiesgo === filtros.nivelRiesgo,
                );
            }

            if (filtros.subtipoEvento && filtros.subtipoEvento !== "todos") {
                notificacionesFiltradas = notificacionesFiltradas.filter((n) => {
                    if (filtros.subtipoEvento === "medical") {
                        return n.esMedicalAlarm === true || n.typeId === 584;
                    } else if (filtros.subtipoEvento === "alarma") {
                        return n.esAlarma === true;
                    } else if (filtros.subtipoEvento === "evento") {
                        return n.esAlarma === false;
                    }
                    return true;
                });
            }

            return {
                notificaciones: notificacionesFiltradas,
                total: todosLosIds.length,
                pagina,
                totalPaginas: Math.ceil(todosLosIds.length / itemsPorPagina),
                itemsPorPagina,
            };
        } catch (error) {
            console.error("❌ Error en fallback:", error);
            return {
                notificaciones: [],
                total: 0,
                pagina: 1,
                totalPaginas: 0,
                itemsPorPagina: 10,
            };
        }
    }

    _obtenerFechaRealNotificacion(notificacion) {
        if (notificacion.eventId || notificacion.detalles?.eventId) {
            const fechaEvento =
                notificacion.detalles?.fechaEvento ||
                notificacion.detalles?.createdAt ||
                notificacion.fechaEvento;

            if (fechaEvento) {
                return this._convertirAFecha(fechaEvento);
            }
        }

        if (notificacion.incidenciaId) {
            const fechaIncidencia =
                notificacion.detalles?.fechaCreacion || notificacion.fechaCreacion;

            if (fechaIncidencia) {
                return this._convertirAFecha(fechaIncidencia);
            }
        }

        return notificacion.fecha || new Date();
    }

    _convertirAFecha(valor) {
        if (!valor) return new Date();
        if (valor instanceof Date) return valor;
        if (valor && typeof valor.toDate === "function") return valor.toDate();
        if (valor._seconds) return new Date(valor._seconds * 1000);
        if (typeof valor === "string") return new Date(valor);
        return new Date(valor);
    }

    async obtenerConteoNoLeidas(usuarioId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId) return 0;

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const q = query(
                collection(db, collectionName),
                where("usuariosIds", "array-contains", usuarioId)
            );
            const snapshot = await getCountFromServer(q);
            return snapshot.data().count;
        } catch (error) {
            return 0;
        }
    }

    async limpiarNotificacionesUsuario(usuarioId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId) return false;

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(
                organizacionCamelCase,
            );
            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);

            await deleteDoc(userNotifRef);

            return true;
        } catch (error) {
            return false;
        }
    }

    _getColorPorRiesgo(riesgo, tipo) {
        if (tipo !== "canalizacion") return "#007bff";

        const colores = {
            bajo: "#28a745",
            medio: "#ffc107",
            alto: "#fd7e14",
            critico: "#dc3545",
        };
        return colores[riesgo] || "#28a745";
    }

    _getAreaSeguridadIdDesdeLocalStorage(organizacionCamelCase) {
        try {
            const CACHE_KEY = `area_seguridad_id_${organizacionCamelCase}`;
            const cachedId = localStorage.getItem(CACHE_KEY);

            if (cachedId) {
                return cachedId;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    _setAreaSeguridadIdEnCache(organizacionCamelCase, areaId) {
        try {
            const CACHE_KEY = `area_seguridad_id_${organizacionCamelCase}`;
            localStorage.setItem(CACHE_KEY, areaId);
        } catch (error) {
            // Error silencioso
        }
    }

    async _getUsuariosSeguridadRapido(organizacionCamelCase) {
        const CACHE_KEY = `usuarios_seguridad_${organizacionCamelCase}`;
        const CACHE_TIME_KEY = `usuarios_seguridad_time_${organizacionCamelCase}`;

        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(CACHE_TIME_KEY);
        const ahora = Date.now();

        if (cachedData && cacheTime && ahora - parseInt(cacheTime) < 600000) {
            return JSON.parse(cachedData);
        }

        const usuarios = await this._getUsuariosPorNombreArea(
            "Seguridad",
            organizacionCamelCase,
        );

        const cacheData = usuarios.map((u) => ({
            id: u.id,
            nombreCompleto: u.nombreCompleto,
            areaAsignadaId: u.areaAsignadaId,
            dispositivos: u.dispositivos || [],
        }));

        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        localStorage.setItem(CACHE_TIME_KEY, ahora.toString());

        return usuarios;
    }

    // ========== REEMPLAZAR MÉTODO notificarMultiplesAreas ==========
    // Ubicación: Dentro de la clase NotificacionAreaManager

    async notificarMultiplesAreas({
        areas = [],
        incidenciaId,
        incidenciaTitulo = "",
        sucursalId = "",
        sucursalNombre = "",
        categoriaId = "",
        categoriaNombre = "",
        nivelRiesgo = "",
        tipo = "canalizacion",
        mensajePersonalizado = "",
        detalles = {},
        prioridad = "normal",
        remitenteId = null,
        remitenteNombre = null,
        organizacionCamelCase,
        enviarPush = true,
    }) {
        try {
            if (!organizacionCamelCase) {
                return { success: false, error: "organizacionCamelCase requerido" };
            }

            if (!areas || areas.length === 0) {
                return {
                    success: true,
                    notificacionCreada: false,
                    mensaje: "Sin áreas para notificar",
                };
            }

            if (!incidenciaId) {
                return { success: false, error: "incidenciaId requerido" };
            }

            if (!remitenteId || !remitenteNombre) {
                if (this.usuarioActual) {
                    remitenteId = this.usuarioActual.id;
                    remitenteNombre = this.usuarioActual.nombreCompleto;
                } else {
                    remitenteId = "sistema";
                    remitenteNombre = "Sistema";
                }
            }

            const areasIds = areas.map((a) => a.id);

            const colaboradores = await this._getUsuariosPorMultiplesAreas(
                areasIds,
                organizacionCamelCase,
            );
            const administradores = await this._getAdministradores(
                organizacionCamelCase,
            );

            const todosDestinatarios = [...colaboradores, ...administradores];
            const idsUnicos = new Set();
            const destinatariosUnicos = [];
            const usuariosIds = []; // NUEVO: Array para guardar en la notificación

            for (const destinatario of todosDestinatarios) {
                if (!idsUnicos.has(destinatario.id)) {
                    idsUnicos.add(destinatario.id);
                    destinatariosUnicos.push(destinatario);
                    usuariosIds.push(destinatario.id); // NUEVO: Guardar ID
                }
            }

            const titulo = this._generarTitulo(tipo, areas, nivelRiesgo);
            let mensaje = mensajePersonalizado;

            if (!mensaje) {
                mensaje = this._generarMensaje(
                    tipo,
                    areas,
                    incidenciaTitulo,
                    sucursalNombre,
                );
            }

            const urlDestino = `../verIncidencias/verIncidencias.html?id=${incidenciaId}`;
            const notificacionId = this._generarNotificacionId();

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const notificacionRef = doc(db, collectionName, notificacionId);

            const notificacionData = {
                id: notificacionId,
                titulo: titulo,
                mensaje: mensaje,
                tipo: tipo,
                fecha: serverTimestamp(),
                organizacionCamelCase: organizacionCamelCase,
                remitenteId: remitenteId,
                remitenteNombre: remitenteNombre,
                prioridad: prioridad,

                incidenciaId: incidenciaId,
                incidenciaTitulo: incidenciaTitulo,
                sucursalId: sucursalId,
                sucursalNombre: sucursalNombre,
                categoriaId: categoriaId,
                categoriaNombre: categoriaNombre,
                nivelRiesgo: nivelRiesgo,

                areasDestino: areas.map((a) => ({ id: a.id, nombre: a.nombre })),
                areasIds: areasIds,

                totalUsuarios: colaboradores.length,
                totalAdministradores: administradores.length,
                leidas: 0,

                // ========== NUEVO: Array de usuarios destinatarios ==========
                usuariosIds: usuariosIds,

                detalles: detalles,
                icono: tipo === "canalizacion" ? "fa-share-alt" : "fa-bell",
                color: this._getColorPorRiesgo(nivelRiesgo, tipo),

                urlDestino: urlDestino,

                fechaCreacion: serverTimestamp(),
            };

            await consumo.registrarFirestoreEscritura(collectionName, notificacionId);
            await setDoc(notificacionRef, notificacionData);

            if (destinatariosUnicos.length > 0) {
                await this._crearIndicesUsuarios(
                    notificacionId,
                    destinatariosUnicos,
                    organizacionCamelCase,
                );
            }

            let pushResult = null;
            if (enviarPush && destinatariosUnicos.length > 0) {
                pushResult = await this._enviarNotificacionesPush(
                    destinatariosUnicos,
                    notificacionData,
                );
            }

            return {
                success: true,
                notificacionId: notificacionId,
                totalColaboradores: colaboradores.length,
                totalAdministradores: administradores.length,
                totalDestinatarios: destinatariosUnicos.length,
                areas: areas.length,
                push: pushResult,
            };
        } catch (error) {
            console.error("❌ Error en notificarMultiplesAreas:", error);
            return { success: false, error: error.message };
        }
    }

    _generarTitulo(tipo, areas, nivelRiesgo) {
        if (tipo === "canalizacion") {
            if (areas.length === 1) {
                return `📢 Incidencia canalizada a ${areas[0].nombre}`;
            } else {
                return `📢 Incidencia canalizada a ${areas.length} áreas`;
            }
        }
        return "📢 Nueva notificación";
    }

    _generarMensaje(tipo, areas, incidenciaTitulo, sucursalNombre) {
        let mensaje = "";

        if (incidenciaTitulo) {
            mensaje = incidenciaTitulo;
        } else {
            mensaje = "Se ha canalizado una nueva incidencia";
        }

        if (sucursalNombre) {
            mensaje += ` en ${sucursalNombre}`;
        }

        return mensaje;
    }

    async _crearIndicesUsuarios(notificacionId, usuarios, organizacionCamelCase) {
        try {
            if (!usuarios || usuarios.length === 0) return;

            const batch = writeBatch(db);
            const userNotifCollectionName = this._getUserNotificacionesCollectionName(
                organizacionCamelCase,
            );

            for (const usuario of usuarios) {
                const userNotifRef = doc(db, userNotifCollectionName, usuario.id);
                batch.set(
                    userNotifRef,
                    {
                        notificaciones: {
                            [notificacionId]: {
                                leida: false,
                                fechaRecepcion: serverTimestamp(),
                                fechaLectura: null,
                            },
                        },
                        totalPendientes: increment(1),
                        ultimaActualizacion: serverTimestamp(),
                    },
                    { merge: true },
                );
            }

            await batch.commit();
        } catch (error) {
            console.error("❌ Error creando índices de usuarios:", error);
            throw error;
        }
    }

    /**
     * Obtiene el documento de inicio para paginación
     */
    async _getStartAfterDoc(collectionName, constraints, pagina, itemsPorPagina) {
        if (pagina <= 1) return null;

        try {
            const skipQuery = query(
                collection(db, collectionName),
                ...constraints,
                limit((pagina - 1) * itemsPorPagina),
            );

            const snapshot = await getDocs(skipQuery);

            if (snapshot.docs.length > 0) {
                return snapshot.docs[snapshot.docs.length - 1];
            }

            return null;
        } catch (error) {
            console.error("Error obteniendo startAfter:", error);
            return null;
        }
    }

    async _getAdministradoresCache(organizacionCamelCase) {
        const CACHE_KEY = `admins_${organizacionCamelCase}`;
        const CACHE_TIME_KEY = `admins_time_${organizacionCamelCase}`;

        try {
            const cached = localStorage.getItem(CACHE_KEY);
            const cacheTime = localStorage.getItem(CACHE_TIME_KEY);

            // Cache válido por 5 minutos
            if (cached && cacheTime && (Date.now() - parseInt(cacheTime)) < 5 * 60 * 1000) {
                const parsedCache = JSON.parse(cached);
                return parsedCache;
            }
        } catch (e) {
            // Error leyendo cache, continuar
        }

        const admins = await this._getAdministradores(organizacionCamelCase);

        const cacheData = admins.map(a => ({
            id: a.id,
            nombreCompleto: a.nombreCompleto,
            correo: a.correo,
            dispositivos: a.dispositivos || [],
            esAdmin: a.esAdmin,
            rol: a.rol
        }));

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        } catch (e) {
            // Error guardando cache, no crítico
        }

        return admins;
    }

    async actualizarNotificacionEvento(eventoId, organizacionCamelCase, datosAtencion) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);

            // Buscar la notificación por eventId
            const q = query(
                collection(db, collectionName),
                where("eventId", "==", eventoId),
                limit(1)
            );

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                return false;
            }

            const notificacionDoc = snapshot.docs[0];
            const notificacionRef = doc(db, collectionName, notificacionDoc.id);

            // Construir nuevo mensaje
            const accion = datosAtencion.estadoEvento === 'atendido' ? 'atendió' : 'ignoró';
            const nuevoMensaje = datosAtencion.mensajeRespuesta
                ? `${datosAtencion.nombreUsuarioAtencion} ${accion} este evento: "${datosAtencion.mensajeRespuesta}"`
                : `${datosAtencion.nombreUsuarioAtencion} ${accion} este evento`;

            // Actualizar con datos de atención
            await updateDoc(notificacionRef, {
                atendido: datosAtencion.atendido || false,
                idUsuarioAtencion: datosAtencion.idUsuarioAtencion || null,
                nombreUsuarioAtencion: datosAtencion.nombreUsuarioAtencion || null,
                fechaAtencion: serverTimestamp(),
                mensajeRespuesta: datosAtencion.mensajeRespuesta || null,
                estadoEvento: datosAtencion.estadoEvento || 'atendido',
                mensaje: nuevoMensaje,
                // Actualizar color según estado
                color: datosAtencion.estadoEvento === 'atendido' ? '#2ecc71' : '#95a5a6'
            });

            return true;

        } catch (error) {
            console.error('❌ Error actualizando notificación:', error);
            return false;
        }
    }

}

export { NotificacionArea, NotificacionAreaManager };
