// notificacionArea.js - VERSIÓN QUE ELIMINA NOTIFICACIONES DESPUÉS DE VERLAS

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
    serverTimestamp,
    increment,
    writeBatch,
    deleteDoc,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from '/config/firebase-config.js';
import consumo from '/clases/consumoFirebase.js';
import { CLOUD_FUNCTION_BASE_URL } from '/config/urlCloudFunction.js';

class NotificacionArea {
    constructor(id, data) {
        this.id = id;
        this.titulo = data.titulo || '';
        this.mensaje = data.mensaje || '';
        this.tipo = data.tipo || 'canalizacion';
        this.fecha = data.fecha ? this._convertirFecha(data.fecha) : new Date();
        this.organizacionCamelCase = data.organizacionCamelCase || '';
        this.remitenteId = data.remitenteId || '';
        this.remitenteNombre = data.remitenteNombre || '';
        
        this.incidenciaId = data.incidenciaId || '';
        this.incidenciaTitulo = data.incidenciaTitulo || '';
        this.sucursalId = data.sucursalId || '';
        this.sucursalNombre = data.sucursalNombre || '';
        this.categoriaId = data.categoriaId || '';
        this.categoriaNombre = data.categoriaNombre || '';
        this.nivelRiesgo = data.nivelRiesgo || '';
        
        this.areasIds = data.areasIds || [];
        this.areasDestino = data.areasDestino || [];
        
        this.totalUsuarios = data.totalUsuarios || 0;
        this.leidas = data.leidas || 0;
        
        this.urlDestino = data.urlDestino || '';
        
        this.detalles = data.detalles || {};
        this.prioridad = data.prioridad || 'normal';
        this.icono = data.icono || 'fa-bell';
        this.color = data.color || '#007bff';
        
        this.leida = data.leida || false;
        this.fechaLectura = data.fechaLectura || null;
    }

    _convertirFecha(fecha) {
        if (!fecha) return new Date();
        if (fecha && typeof fecha.toDate === 'function') return fecha.toDate();
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'string') return new Date(fecha);
        if (fecha && fecha._seconds) return new Date(fecha._seconds * 1000);
        return new Date();
    }

    getTiempoRelativo() {
        if (!this.fecha) return '';
        
        const ahora = new Date();
        const diffMs = ahora - this.fecha;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHoras = Math.floor(diffMs / 3600000);
        const diffDias = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return 'Ahora mismo';
        if (diffMin < 60) return `Hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
        if (diffHoras < 24) return `Hace ${diffHoras} ${diffHoras === 1 ? 'hora' : 'horas'}`;
        if (diffDias < 7) return `Hace ${diffDias} ${diffDias === 1 ? 'día' : 'días'}`;
        
        return this.fecha.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    getIcono() {
        const iconos = {
            canalizacion: 'fa-share-alt',
            comentario: 'fa-comment',
            asignacion: 'fa-user-check',
            resolucion: 'fa-check-circle',
            vencimiento: 'fa-clock',
            urgente: 'fa-exclamation-triangle'
        };
        return iconos[this.tipo] || this.icono || 'fa-bell';
    }

    getColor() {
        const colores = {
            canalizacion: '#28a745',
            comentario: '#17a2b8',
            asignacion: '#ffc107',
            resolucion: '#28a745',
            vencimiento: '#dc3545',
            urgente: '#dc3545'
        };
        return colores[this.tipo] || this.color || '#6c757d';
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
            urlDestino: this.urlDestino || `../verIncidencias/verIncidencias.html?id=${this.incidenciaId}`,
            prioridad: this.prioridad,
            detalles: this.detalles
        };
    }
}

class NotificacionAreaManager {
    constructor() {
        this.usuarioActual = null;
        this.functionUrl = `${CLOUD_FUNCTION_BASE_URL}sendPushNotification`;
        this.functionUrlV2 = 'https://sendpushnotification-5orj5w7mha-uc.a.run.app';
        this._initUsuario();
    }

    _initUsuario() {
        try {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            if (userData && userData.id) {
                this.usuarioActual = {
                    id: userData.id,
                    uid: userData.id,
                    nombreCompleto: userData.nombreCompleto || 'Usuario',
                    correo: userData.email || userData.correo || '',
                    organizacionCamelCase: userData.organizacionCamelCase || '',
                    rol: (userData.rol || '').toLowerCase()
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
                where("status", "==", true)
            );
            
            await consumo.registrarFirestoreLectura(colaboradoresCollection, `usuarios por área: ${areaId}`);
            
            const snapshot = await getDocs(q);
            const usuarios = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                usuarios.push({
                    id: doc.id,
                    nombreCompleto: data.nombreCompleto || 'Usuario',
                    correo: data.correoElectronico || '',
                    dispositivos: data.dispositivos || [],
                    areaAsignadaId: data.areaAsignadaId,
                    esAdmin: false
                });
            });

            return usuarios;

        } catch (error) {
            return [];
        }
    }

    _extraerTokensActivos(dispositivos) {
        if (!dispositivos || !Array.isArray(dispositivos)) return [];
        return dispositivos
            .filter(d => d.token && d.enabled !== false)
            .map(d => d.token);
    }

    async _getUsuariosPorMultiplesAreas(areasIds, organizacionCamelCase) {
        try {
            if (!areasIds || areasIds.length === 0) return [];

            const todosUsuarios = [];
            const idsVistos = new Set();
            
            const promises = areasIds.map(areaId => 
                this._getUsuariosPorAreaId(areaId, organizacionCamelCase)
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
    
    /**
     * Obtener TODOS los administradores de la organización
     * Busca en la colección GLOBAL 'administradores' (sin camel case)
     */
    async _getAdministradores(organizacionCamelCase) {
        try {
            const adminRef = collection(db, 'administradores');
            
            const q = query(
                adminRef,
                where("status", "==", true)
            );
            
            await consumo.registrarFirestoreLectura('administradores', 'obtener_administradores');
            
            const snapshot = await getDocs(q);
            const administradores = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const adminOrgCamelCase = data.organizacionCamelCase || this._generarCamelCase(data.organizacion);
                
                if (adminOrgCamelCase === organizacionCamelCase) {
                    administradores.push({
                        id: doc.id,
                        nombreCompleto: data.nombreCompleto || 'Administrador',
                        correo: data.correoElectronico || data.email || '',
                        dispositivos: data.dispositivos || [],
                        esAdmin: true,
                        rol: 'administrador'
                    });
                }
            });
            
            return administradores;
            
        } catch (error) {
            console.error('Error obteniendo administradores:', error);
            return [];
        }
    }
    
    _generarCamelCase(texto) {
        if (!texto || typeof texto !== 'string') return '';
        return texto
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
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
                        userType: usuario.esAdmin ? 'administrador' : 'colaborador',
                        organizacionCamelCase: notificacionData.organizacionCamelCase,
                        title: notificacionData.titulo,
                        body: notificacionData.mensaje,
                        url: notificacionData.urlDestino,
                        senderToken: notificacionData.remitenteId || 'sistema',
                        tokens: tokens,
                        data: {
                            incidenciaId: notificacionData.incidenciaId,
                            tipo: notificacionData.tipo,
                            nivelRiesgo: notificacionData.nivelRiesgo,
                            notificacionId: notificacionData.id,
                            areasIds: notificacionData.areasIds
                        }
                    };
                    
                    let response = await fetch(this.functionUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok && this.functionUrlV2) {
                        response = await fetch(this.functionUrlV2, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
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

                await new Promise(r => setTimeout(r, 100));
            }

            if (totalNotificacionesPush > 0) {
                await consumo.registrarNotificacionesPush(
                    totalNotificacionesPush,
                    usuariosExitosos,
                    'sendPushNotification',
                    {
                        incidenciaId: notificacionData.incidenciaId,
                        totalUsuariosPotenciales: usuarios.length,
                        tipoNotificacion: notificacionData.tipo
                    }
                );
            }

            return { 
                success: enviados > 0, 
                enviados: usuariosExitosos,
                total: usuarios.length,
                notificacionesPush: totalNotificacionesPush
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async notificarMultiplesAreas({
        areas = [],
        incidenciaId,
        incidenciaTitulo = '',
        sucursalId = '',
        sucursalNombre = '',
        categoriaId = '',
        categoriaNombre = '',
        nivelRiesgo = '',
        tipo = 'canalizacion',
        mensajePersonalizado = '',
        detalles = {},
        prioridad = 'normal',
        remitenteId = null,
        remitenteNombre = null,
        organizacionCamelCase,
        enviarPush = true
    }) {
        try {
            if (!organizacionCamelCase) {
                return { success: false, error: 'organizacionCamelCase requerido' };
            }

            if (!areas || areas.length === 0) {
                return { success: true, notificacionCreada: false, mensaje: 'Sin áreas para notificar' };
            }

            if (!incidenciaId) {
                return { success: false, error: 'incidenciaId requerido' };
            }

            if (!remitenteId || !remitenteNombre) {
                if (this.usuarioActual) {
                    remitenteId = this.usuarioActual.id;
                    remitenteNombre = this.usuarioActual.nombreCompleto;
                } else {
                    remitenteId = 'sistema';
                    remitenteNombre = 'Sistema';
                }
            }

            const areasIds = areas.map(a => a.id);
            
            const colaboradores = await this._getUsuariosPorMultiplesAreas(areasIds, organizacionCamelCase);            
            const administradores = await this._getAdministradores(organizacionCamelCase);            
            const todosDestinatarios = [...colaboradores, ...administradores];
            const idsUnicos = new Set();
            const destinatariosUnicos = [];
            
            for (const destinatario of todosDestinatarios) {
                if (!idsUnicos.has(destinatario.id)) {
                    idsUnicos.add(destinatario.id);
                    destinatariosUnicos.push(destinatario);
                }
            }
            
            const titulo = this._generarTitulo(tipo, areas, nivelRiesgo);
            let mensaje = mensajePersonalizado;
            
            if (!mensaje) {
                mensaje = this._generarMensaje(tipo, areas, incidenciaTitulo, sucursalNombre);
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
                
                areasDestino: areas.map(a => ({ id: a.id, nombre: a.nombre })),
                areasIds: areasIds,
                
                totalUsuarios: colaboradores.length,
                totalAdministradores: administradores.length,
                leidas: 0,
                
                detalles: detalles,
                icono: tipo === 'canalizacion' ? 'fa-share-alt' : 'fa-bell',
                color: this._getColorPorRiesgo(nivelRiesgo, tipo),
                
                urlDestino: urlDestino,
                
                fechaCreacion: serverTimestamp()
            };

            await consumo.registrarFirestoreEscritura(collectionName, notificacionId);
            await setDoc(notificacionRef, notificacionData);

            if (destinatariosUnicos.length > 0) {
                await this._crearIndicesUsuarios(notificacionId, destinatariosUnicos, organizacionCamelCase);
            }

            let pushResult = null;
            if (enviarPush && destinatariosUnicos.length > 0) {
                pushResult = await this._enviarNotificacionesPush(destinatariosUnicos, notificacionData);
            }

            return {
                success: true,
                notificacionId: notificacionId,
                totalColaboradores: colaboradores.length,
                totalAdministradores: administradores.length,
                totalDestinatarios: destinatariosUnicos.length,
                areas: areas.length,
                push: pushResult
            };

        } catch (error) {
            console.error('Error en notificarMultiplesAreas:', error);
            return { success: false, error: error.message };
        }
    }

    _generarTitulo(tipo, areas, nivelRiesgo) {
        if (tipo === 'canalizacion') {
            if (areas.length === 1) {
                return `📢 Incidencia canalizada a ${areas[0].nombre}`;
            } else {
                return `📢 Incidencia canalizada a ${areas.length} áreas`;
            }
        }
        return '📢 Nueva notificación';
    }

    _generarMensaje(tipo, areas, incidenciaTitulo, sucursalNombre) {
        let mensaje = '';
        
        if (incidenciaTitulo) {
            mensaje = incidenciaTitulo;
        } else {
            mensaje = 'Se ha canalizado una nueva incidencia';
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
            const userNotifCollectionName = this._getUserNotificacionesCollectionName(organizacionCamelCase);
            let operaciones = 0;

            for (const usuario of usuarios) {
                const userNotifRef = doc(db, userNotifCollectionName, usuario.id);
                
                batch.set(userNotifRef, {
                    notificaciones: {
                        [notificacionId]: {
                            leida: false,
                            fechaRecepcion: serverTimestamp(),
                            fechaLectura: null
                        }
                    },
                    ultimaActualizacion: serverTimestamp(),
                    totalPendientes: increment(1)
                }, { merge: true });

                operaciones++;

                if (operaciones >= 400) {
                    await consumo.registrarFirestoreActualizacion(userNotifCollectionName, `batch_${operaciones}_usuarios`);
                    await batch.commit();
                    operaciones = 0;
                }
            }

            if (operaciones > 0) {
                await consumo.registrarFirestoreActualizacion(userNotifCollectionName, `batch_final_${operaciones}_usuarios`);
                await batch.commit();
            }

        } catch (error) {
            console.error('Error creando índices de usuarios:', error);
        }
    }

    /**
     * Marcar una notificación como leída Y ELIMINARLA de la lista del usuario
     */
    async marcarComoLeida(usuarioId, notificacionId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId || !notificacionId) return false;

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(organizacionCamelCase);
            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);

            const userNotifSnap = await getDoc(userNotifRef);
            
            if (!userNotifSnap.exists()) {
                return false;
            }
            
            const userData = userNotifSnap.data();
            const notificacionesMap = userData.notificaciones || {};
            const notificacionActual = notificacionesMap[notificacionId];
            
            // Si ya está leída o no existe, retornar true
            if (!notificacionActual || notificacionActual.leida === true) {
                return true;
            }
            
            // ELIMINAR la notificación del mapa de notificaciones del usuario
            // en lugar de solo marcarla como leída
            const updatedNotificaciones = { ...notificacionesMap };
            delete updatedNotificaciones[notificacionId];
            
            // Actualizar totalPendientes
            const totalPendientes = (userData.totalPendientes || 0) - 1;
            
            // Actualizar en Firestore
            await updateDoc(userNotifRef, {
                notificaciones: updatedNotificaciones,
                totalPendientes: totalPendientes >= 0 ? totalPendientes : 0,
                ultimaActualizacion: serverTimestamp()
            });

            // Actualizar contador global de la notificación (leidas)
            try {
                const notificacionesCollectionName = this._getCollectionName(organizacionCamelCase);
                const notificacionRef = doc(db, notificacionesCollectionName, notificacionId);
                await updateDoc(notificacionRef, {
                    leidas: increment(1)
                });
            } catch (error) {
                // Error silencioso
            }

            return true;

        } catch (error) {
            console.error('Error marcando notificación como leída:', error);
            return false;
        }
    }

    /**
     * Marcar TODAS las notificaciones como leídas Y ELIMINARLAS de la lista del usuario
     */
    async marcarTodasComoLeidas(usuarioId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId) return false;

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(organizacionCamelCase);
            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);
            
            const userNotifSnap = await getDoc(userNotifRef);

            if (!userNotifSnap.exists()) {
                return false;
            }

            const userData = userNotifSnap.data();
            const notificacionesMap = userData.notificaciones || {};
            
            // Obtener IDs de notificaciones no leídas
            const noLeidasIds = Object.keys(notificacionesMap).filter(id => !notificacionesMap[id].leida);
            
            if (noLeidasIds.length === 0) {
                return true;
            }
            
            // ELIMINAR todas las notificaciones del usuario
            await updateDoc(userNotifRef, {
                notificaciones: {},
                totalPendientes: 0,
                ultimaActualizacion: serverTimestamp()
            });

            // Actualizar contadores globales
            const notificacionesCollectionName = this._getCollectionName(organizacionCamelCase);
            for (const notifId of noLeidasIds) {
                try {
                    const notifRef = doc(db, notificacionesCollectionName, notifId);
                    await updateDoc(notifRef, {
                        leidas: increment(1)
                    });
                } catch (e) {
                    // Error silencioso
                }
            }

            return true;

        } catch (error) {
            console.error('Error marcando todas como leídas:', error);
            return false;
        }
    }

    async obtenerNotificaciones(usuarioId, organizacionCamelCase, soloNoLeidas = false, limite = 50) {
        try {
            if (!organizacionCamelCase || !usuarioId) return [];

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(organizacionCamelCase);
            const notificacionesCollectionName = this._getCollectionName(organizacionCamelCase);

            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);
            
            await consumo.registrarFirestoreLectura(userNotifCollectionName, usuarioId);
            
            const userNotifSnap = await getDoc(userNotifRef);

            if (!userNotifSnap.exists()) {
                return [];
            }

            const userData = userNotifSnap.data();
            const notificacionesMap = userData.notificaciones || {};
            
            let notificacionesIds = Object.keys(notificacionesMap);
            
            if (soloNoLeidas) {
                notificacionesIds = notificacionesIds.filter(id => !notificacionesMap[id].leida);
            }

            notificacionesIds.sort((a, b) => {
                const fechaA = notificacionesMap[a].fechaRecepcion?.toDate?.() || new Date(0);
                const fechaB = notificacionesMap[b].fechaRecepcion?.toDate?.() || new Date(0);
                return fechaB - fechaA;
            });

            notificacionesIds = notificacionesIds.slice(0, limite);

            if (notificacionesIds.length === 0) {
                return [];
            }

            const notificaciones = [];

            for (let i = 0; i < notificacionesIds.length; i += 10) {
                const batchIds = notificacionesIds.slice(i, i + 10);
                
                const q = query(
                    collection(db, notificacionesCollectionName),
                    where("__name__", "in", batchIds)
                );
                
                await consumo.registrarFirestoreLectura(notificacionesCollectionName, `batch_${i}`);
                
                const snapshot = await getDocs(q);
                
                snapshot.forEach(doc => {
                    const notifData = doc.data();
                    const userNotifData = notificacionesMap[doc.id] || { leida: false };
                    
                    const notificacion = new NotificacionArea(doc.id, {
                        ...notifData,
                        leida: userNotifData.leida,
                        fechaLectura: userNotifData.fechaLectura
                    });
                    
                    notificaciones.push(notificacion);
                });
            }

            return notificaciones;

        } catch (error) {
            console.error('Error obteniendo notificaciones:', error);
            return [];
        }
    }

    async obtenerConteoNoLeidas(usuarioId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId) return 0;

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(organizacionCamelCase);
            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);
            
            const userNotifSnap = await getDoc(userNotifRef);

            if (!userNotifSnap.exists()) {
                return 0;
            }

            const userData = userNotifSnap.data();
            const totalPendientes = userData.totalPendientes || 0;
            
            // Si el contador está desincronizado, recalcular
            if (totalPendientes < 0) {
                const notificaciones = userData.notificaciones || {};
                const noLeidasReales = Object.values(notificaciones).filter(n => !n.leida).length;
                
                await updateDoc(userNotifRef, {
                    totalPendientes: noLeidasReales
                });
                
                return noLeidasReales;
            }
            
            return totalPendientes;

        } catch (error) {
            return 0;
        }
    }

    async limpiarNotificacionesUsuario(usuarioId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId) return false;

            const userNotifCollectionName = this._getUserNotificacionesCollectionName(organizacionCamelCase);
            const userNotifRef = doc(db, userNotifCollectionName, usuarioId);
            
            await deleteDoc(userNotifRef);
            
            return true;

        } catch (error) {
            return false;
        }
    }

    async obtenerNotificacionesPorArea(areaId, organizacionCamelCase, limite = 50) {
        try {
            if (!organizacionCamelCase || !areaId) return [];

            const notificacionesCollectionName = this._getCollectionName(organizacionCamelCase);
            
            const q = query(
                collection(db, notificacionesCollectionName),
                where("areasIds", "array-contains", areaId),
                orderBy("fecha", "desc"),
                limit(limite)
            );
            
            await consumo.registrarFirestoreLectura(notificacionesCollectionName, `notificaciones por área: ${areaId}`);
            
            const snapshot = await getDocs(q);
            const notificaciones = [];
            
            snapshot.forEach(doc => {
                notificaciones.push(new NotificacionArea(doc.id, doc.data()));
            });
            
            return notificaciones;

        } catch (error) {
            return [];
        }
    }

    async limpiarNotificacionesAntiguas(organizacionCamelCase, dias = 30) {
        try {
            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() - dias);
            
            const notificacionesCollectionName = this._getCollectionName(organizacionCamelCase);
            const q = query(
                collection(db, notificacionesCollectionName),
                where("fecha", "<", fechaLimite),
                limit(100)
            );
            
            await consumo.registrarFirestoreLectura(notificacionesCollectionName, 'limpieza_notificaciones_antiguas');
            
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            if (snapshot.size > 0) {
                await consumo.registrarFirestoreEliminacion(notificacionesCollectionName, `batch_limpieza_${snapshot.size}_notificaciones`);
            }
            
            await batch.commit();
            
            return { success: true, eliminadas: snapshot.size };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    _getColorPorRiesgo(riesgo, tipo) {
        if (tipo !== 'canalizacion') return '#007bff';
        
        const colores = {
            'bajo': '#28a745',
            'medio': '#ffc107',
            'alto': '#fd7e14',
            'critico': '#dc3545'
        };
        return colores[riesgo] || '#28a745';
    }
}

export { NotificacionArea, NotificacionAreaManager };