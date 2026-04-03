// notificacionSucursal.js - CLASE PARA NOTIFICACIONES POR SUCURSAL
// Hereda de NotificacionAreaManager

import { NotificacionAreaManager, NotificacionArea } from './notificacionArea.js';
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
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from '/config/firebase-config.js';
import consumo from '/clases/consumoFirebase.js';
import { CLOUD_FUNCTION_BASE_URL } from '/config/urlCloudFunction.js';

class NotificacionSucursal extends NotificacionArea {
    constructor(id, data) {
        super(id, data);
        this.sucursalId = data.sucursalId || '';
        this.sucursalNombre = data.sucursalNombre || '';
        this.colaboradorIds = data.colaboradorIds || [];
        this.tipoDestino = data.tipoDestino || 'sucursal';
    }

    toUI() {
        const baseUI = super.toUI();
        return {
            ...baseUI,
            sucursalId: this.sucursalId,
            sucursalNombre: this.sucursalNombre,
            colaboradorIds: this.colaboradorIds,
            tipoDestino: this.tipoDestino
        };
    }
}

class NotificacionSucursalManager extends NotificacionAreaManager {
    constructor() {
        super();
        this.sucursalesCache = new Map();
    }

    /**
     * Obtener colaboradores de una sucursal específica
     */
    async _getColaboradoresPorSucursal(sucursalId, organizacionCamelCase) {
        try {
            if (!sucursalId) return [];

            const colaboradoresCollection = `colaboradores_${organizacionCamelCase}`;
            const colabRef = collection(db, colaboradoresCollection);
            
            const q = query(
                colabRef,
                where("sucursalAsignadaId", "==", sucursalId),
                where("status", "==", true)
            );
            
            await consumo.registrarFirestoreLectura(colaboradoresCollection, `colaboradores por sucursal: ${sucursalId}`);
            
            const snapshot = await getDocs(q);
            const colaboradores = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                colaboradores.push({
                    id: doc.id,
                    nombreCompleto: data.nombreCompleto || 'Colaborador',
                    correo: data.correoElectronico || '',
                    dispositivos: data.dispositivos || [],
                    sucursalAsignadaId: data.sucursalAsignadaId,
                    areaAsignadaId: data.areaAsignadaId,
                    cargoId: data.cargoId,
                    esAdmin: false
                });
            });

            return colaboradores;

        } catch (error) {
            console.error('Error obteniendo colaboradores por sucursal:', error);
            return [];
        }
    }

    /**
     * Obtener colaboradores de múltiples sucursales
     */
    async _getColaboradoresPorMultiplesSucursales(sucursalesIds, organizacionCamelCase) {
        try {
            if (!sucursalesIds || sucursalesIds.length === 0) return [];

            const todosColaboradores = [];
            const idsVistos = new Set();
            
            const promises = sucursalesIds.map(sucursalId => 
                this._getColaboradoresPorSucursal(sucursalId, organizacionCamelCase)
            );
            
            const resultados = await Promise.all(promises);
            
            for (const colaboradoresSucursal of resultados) {
                for (const colaborador of colaboradoresSucursal) {
                    if (!idsVistos.has(colaborador.id)) {
                        idsVistos.add(colaborador.id);
                        todosColaboradores.push(colaborador);
                    }
                }
            }

            return todosColaboradores;

        } catch (error) {
            console.error('Error obteniendo colaboradores por múltiples sucursales:', error);
            return [];
        }
    }

    /**
     * Obtener colaboradores por IDs específicos
     */
    async _getColaboradoresPorIds(colaboradoresIds, organizacionCamelCase) {
        try {
            if (!colaboradoresIds || colaboradoresIds.length === 0) return [];

            const colaboradores = [];
            
            for (const colaboradorId of colaboradoresIds) {
                const colaboradoresCollection = `colaboradores_${organizacionCamelCase}`;
                const colabRef = doc(db, colaboradoresCollection, colaboradorId);
                
                await consumo.registrarFirestoreLectura(colaboradoresCollection, colaboradorId);
                const colabSnap = await getDoc(colabRef);
                
                if (colabSnap.exists()) {
                    const data = colabSnap.data();
                    if (data.status === true) {
                        colaboradores.push({
                            id: colabSnap.id,
                            nombreCompleto: data.nombreCompleto || 'Colaborador',
                            correo: data.correoElectronico || '',
                            dispositivos: data.dispositivos || [],
                            sucursalAsignadaId: data.sucursalAsignadaId,
                            esAdmin: false
                        });
                    }
                }
            }
            
            return colaboradores;

        } catch (error) {
            console.error('Error obteniendo colaboradores por IDs:', error);
            return [];
        }
    }

    /**
     * Obtener administradores de la organización
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

    /**
     * NOTIFICAR POR SUCURSAL - PRINCIPAL
     */
    async notificarMultiplesSucursales({
        sucursales = [],
        colaboradoresIds = [],
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
        enviarPush = true,
        incluirAdministradores = true
    }) {
        try {
            if (!organizacionCamelCase) {
                return { success: false, error: 'organizacionCamelCase requerido' };
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

            // Obtener destinatarios
            let destinatarios = [];
            
            // Por sucursales
            if (sucursales && sucursales.length > 0) {
                const sucursalesIds = sucursales.map(s => s.id);
                const colaboradoresSucursales = await this._getColaboradoresPorMultiplesSucursales(
                    sucursalesIds, 
                    organizacionCamelCase
                );
                destinatarios.push(...colaboradoresSucursales);
            }
            
            // Por IDs específicos de colaboradores
            if (colaboradoresIds && colaboradoresIds.length > 0) {
                const colaboradoresEspecificos = await this._getColaboradoresPorIds(
                    colaboradoresIds,
                    organizacionCamelCase
                );
                destinatarios.push(...colaboradoresEspecificos);
            }
            
            // Incluir administradores
            let administradores = [];
            if (incluirAdministradores) {
                administradores = await this._getAdministradores(organizacionCamelCase);
                destinatarios.push(...administradores);
            }
            
            // Eliminar duplicados
            const idsUnicos = new Set();
            const destinatariosUnicos = [];
            for (const destinatario of destinatarios) {
                if (!idsUnicos.has(destinatario.id)) {
                    idsUnicos.add(destinatario.id);
                    destinatariosUnicos.push(destinatario);
                }
            }
            
            // Generar título y mensaje
            const titulo = this._generarTituloSucursal(tipo, sucursales, nivelRiesgo);
            let mensaje = mensajePersonalizado;
            if (!mensaje) {
                mensaje = this._generarMensajeSucursal(tipo, sucursales, incidenciaTitulo);
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
                tipoDestino: 'sucursal',
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
                
                sucursalesDestino: sucursales.map(s => ({ id: s.id, nombre: s.nombre })),
                sucursalesIds: sucursales.map(s => s.id),
                colaboradoresIds: colaboradoresIds || [],
                
                totalUsuarios: destinatariosUnicos.length,
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
                await this._crearIndicesUsuariosSucursal(notificacionId, destinatariosUnicos, organizacionCamelCase);
            }

            let pushResult = null;
            if (enviarPush && destinatariosUnicos.length > 0) {
                pushResult = await this._enviarNotificacionesPush(destinatariosUnicos, notificacionData);
            }

            return {
                success: true,
                notificacionId: notificacionId,
                totalColaboradores: destinatariosUnicos.length - administradores.length,
                totalAdministradores: administradores.length,
                totalDestinatarios: destinatariosUnicos.length,
                sucursales: sucursales.length,
                colaboradoresEspecificos: colaboradoresIds.length,
                push: pushResult
            };

        } catch (error) {
            console.error('Error en notificarMultiplesSucursales:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * NOTIFICAR A UNA SOLA SUCURSAL
     */
    async notificarSucursal({
        sucursalId,
        sucursalNombre,
        incidenciaId,
        incidenciaTitulo = '',
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
        enviarPush = true,
        incluirAdministradores = true
    }) {
        return this.notificarMultiplesSucursales({
            sucursales: [{ id: sucursalId, nombre: sucursalNombre }],
            incidenciaId,
            incidenciaTitulo,
            sucursalId,
            sucursalNombre,
            categoriaId,
            categoriaNombre,
            nivelRiesgo,
            tipo,
            mensajePersonalizado,
            detalles,
            prioridad,
            remitenteId,
            remitenteNombre,
            organizacionCamelCase,
            enviarPush,
            incluirAdministradores
        });
    }

    _generarTituloSucursal(tipo, sucursales, nivelRiesgo) {
        if (tipo === 'canalizacion') {
            if (sucursales.length === 1) {
                return `📢 Incidencia canalizada a sucursal ${sucursales[0].nombre}`;
            } else {
                return `📢 Incidencia canalizada a ${sucursales.length} sucursales`;
            }
        }
        return '📢 Nueva notificación';
    }

    _generarMensajeSucursal(tipo, sucursales, incidenciaTitulo) {
        let mensaje = incidenciaTitulo || 'Se ha canalizado una nueva incidencia';
        return mensaje;
    }

    async _crearIndicesUsuariosSucursal(notificacionId, usuarios, organizacionCamelCase) {
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
            console.error('Error creando índices de usuarios para sucursal:', error);
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

    _generarCamelCase(texto) {
        if (!texto || typeof texto !== 'string') return '';
        return texto
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
    }
}

export { NotificacionSucursal, NotificacionSucursalManager };