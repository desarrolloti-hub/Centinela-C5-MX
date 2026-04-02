// permiso.js - VERSIÓN COMPLETA CON HISTORIAL DE ACTIVIDADES Y REGISTRO DE CONSUMO
// AGREGADOS MÓDULOS: USUARIOS, ESTADÍSTICAS, TAREAS, PERMISOS, LOGIN_MONITOREO

import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from '/config/firebase-config.js';

// [MODIFICACIÓN]: Importar la instancia de consumo
import consumo from '/clases/consumoFirebase.js';

class Permiso {
    constructor(id, data) {
        this.id = id;
        this.areaId = data.areaId || '';
        this.cargoId = data.cargoId || '';

        // MÓDULOS ACTUALIZADOS: Agregados usuarios, estadisticas, tareas, permisos, loginMonitoreo
        this.permisos = data.permisos || {
            areas: false,
            categorias: false,
            sucursales: false,
            regiones: false,
            incidencias: false,
            // NUEVOS MÓDULOS
            usuarios: false,
            estadisticas: false,
            tareas: false,
            permisos: false,
            loginMonitoreo: false
        };

        this.organizacionCamelCase = data.organizacionCamelCase || '';
        this.creadoPor = data.creadoPor || '';
        this.actualizadoPor = data.actualizadoPor || '';

        this.fechaCreacion = data.fechaCreacion ? this._convertirFecha(data.fechaCreacion) : new Date();
        this.fechaActualizacion = data.fechaActualizacion ? this._convertirFecha(data.fechaActualizacion) : new Date();
    }

    _convertirFecha(fecha) {
        if (fecha && typeof fecha.toDate === 'function') return fecha.toDate();
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'string' || typeof fecha === 'number') return new Date(fecha);
        return new Date();
    }

    _formatearFecha(date) {
        if (!date) return 'No disponible';
        try {
            const fecha = this._convertirFecha(date);
            return fecha.toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return 'Fecha inválida';
        }
    }

    puedeAcceder(modulo) {
        return this.permisos[modulo] || false;
    }

    obtenerTodosLosPermisos() {
        return this.permisos;
    }

    obtenerModulosActivos() {
        return Object.entries(this.permisos)
            .filter(([_, valor]) => valor === true)
            .map(([modulo]) => modulo);
    }

    contarModulosActivos() {
        return this.obtenerModulosActivos().length;
    }

    tieneAlgunModulo() {
        return this.contarModulosActivos() > 0;
    }

    // Módulos existentes
    puedeAccederAreas() {
        return this.puedeAcceder('areas');
    }

    puedeAccederCategorias() {
        return this.puedeAcceder('categorias');
    }

    puedeAccederSucursales() {
        return this.puedeAcceder('sucursales');
    }

    puedeAccederRegiones() {
        return this.puedeAcceder('regiones');
    }

    puedeAccederIncidencias() {
        return this.puedeAcceder('incidencias');
    }

    // Módulos anteriores
    puedeAccederUsuarios() {
        return this.puedeAcceder('usuarios');
    }

    puedeAccederEstadisticas() {
        return this.puedeAcceder('estadisticas');
    }

    puedeAccederTareas() {
        return this.puedeAcceder('tareas');
    }

    // NUEVOS MÓDULOS
    puedeAccederPermisos() {
        return this.puedeAcceder('permisos');
    }

    puedeAccederLoginMonitoreo() {
        return this.puedeAcceder('loginMonitoreo');
    }

    toFirestore() {
        return {
            areaId: this.areaId,
            cargoId: this.cargoId,
            permisos: this.permisos,
            creadoPor: this.creadoPor,
            actualizadoPor: this.actualizadoPor,
            fechaCreacion: this.fechaCreacion,
            fechaActualizacion: this.fechaActualizacion
        };
    }

    toFirestoreCreate(usuarioId) {
        return {
            areaId: this.areaId,
            cargoId: this.cargoId,
            permisos: this.permisos,
            organizacionCamelCase: this.organizacionCamelCase,
            creadoPor: usuarioId,
            actualizadoPor: usuarioId,
            fechaCreacion: serverTimestamp(),
            fechaActualizacion: serverTimestamp()
        };
    }

    toFirestoreUpdate(usuarioId) {
        return {
            permisos: this.permisos,
            actualizadoPor: usuarioId,
            fechaActualizacion: serverTimestamp()
        };
    }

    toUI() {
        return {
            id: this.id,
            areaId: this.areaId,
            cargoId: this.cargoId,
            permisos: this.permisos,
            modulosActivos: this.obtenerModulosActivos(),
            totalModulos: this.contarModulosActivos(),
            tieneAcceso: this.tieneAlgunModulo(),
            organizacion: this.organizacionCamelCase,
            fechaCreacion: this._formatearFecha(this.fechaCreacion),
            fechaActualizacion: this._formatearFecha(this.fechaActualizacion),
            creadoPor: this.creadoPor,
            // NUEVOS: acceso específico por módulo
            accesoUsuarios: this.puedeAccederUsuarios(),
            accesoEstadisticas: this.puedeAccederEstadisticas(),
            accesoTareas: this.puedeAccederTareas(),
            accesoPermisos: this.puedeAccederPermisos(),
            accesoLoginMonitoreo: this.puedeAccederLoginMonitoreo()
        };
    }

    toString() {
        const modulos = this.obtenerModulosActivos();
        if (modulos.length === 0) {
            return `Permiso #${this.id}: Sin acceso a módulos`;
        }
        return `Permiso #${this.id}: Acceso a ${modulos.join(', ')}`;
    }
}

class PermisoManager {
    constructor() {
        this.permisos = [];
        this.organizacionNombre = null;
        this.organizacionCamelCase = null;
        this.historialManager = null;

        this._cargarDatosOrganizacion();
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

    _cargarDatosOrganizacion() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                this.organizacionNombre = adminData.organizacion || 'Sin organización';
                this.organizacionCamelCase = adminData.organizacionCamelCase ||
                    this._generarCamelCase(this.organizacionNombre);
                return;
            }

            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            this.organizacionNombre = userData.organizacion || userData.empresa || 'Sin organización';
            this.organizacionCamelCase = userData.organizacionCamelCase ||
                this._generarCamelCase(this.organizacionNombre);

        } catch (error) {
            console.error('Error cargando datos de organización:', error);
            this.organizacionNombre = 'Sin organización';
            this.organizacionCamelCase = 'sinOrganizacion';
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

    _getCollectionName(organizacionOverride = null) {
        const orgId = organizacionOverride || this.organizacionCamelCase || 'sinOrganizacion';
        return `permisos_${orgId}`;
    }

    async crearPermiso(permisoData, userManager) {
        try {
            if (!permisoData.areaId) {
                throw new Error('El área es requerida');
            }
            if (!permisoData.cargoId) {
                throw new Error('El cargo es requerido');
            }

            if (!this.organizacionCamelCase) {
                this._cargarDatosOrganizacion();
            }

            const usuarioActual = userManager?.currentUser || permisoData.usuarioActual;

            if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
                throw new Error('Usuario no tiene organización asignada');
            }

            const organizacion = usuarioActual.organizacionCamelCase;
            const collectionName = this._getCollectionName(organizacion);

            // [MODIFICACIÓN]: Registrar LECTURA para verificar existencia
            await consumo.registrarFirestoreLectura(collectionName, 'verificar existencia');

            const existe = await this.verificarExistente(
                permisoData.areaId,
                permisoData.cargoId,
                organizacion
            );

            if (existe) {
                throw new Error('Ya existe un permiso configurado para esta área y cargo');
            }

            // Obtener nombres para el historial
            let areaNombre = 'Desconocida';
            let cargoNombre = 'Desconocido';
            try {
                const { AreaManager } = await import('/clases/area.js');
                const areaManager = new AreaManager();
                const area = await areaManager.getAreaById(permisoData.areaId, organizacion);
                if (area) {
                    areaNombre = area.nombreArea;
                    const cargos = area.getCargosAsArray();
                    const cargo = cargos.find(c => c.id === permisoData.cargoId);
                    cargoNombre = cargo ? cargo.nombre : 'Desconocido';
                }
            } catch (e) {
                console.warn('No se pudo obtener nombres de área/cargo:', e);
            }

            // MÓDULOS ACTUALIZADOS: Incluir nuevos módulos en permisos iniciales
            const permisosIniciales = permisoData.permisos || {
                areas: false,
                categorias: false,
                sucursales: false,
                regiones: false,
                incidencias: false,
                usuarios: false,
                estadisticas: false,
                tareas: false,
                permisos: false,
                loginMonitoreo: false
            };

            const permisoFirestoreData = {
                areaId: permisoData.areaId,
                cargoId: permisoData.cargoId,
                permisos: permisosIniciales,
                creadoPor: usuarioActual.id || usuarioActual.uid || 'sistema',
                actualizadoPor: usuarioActual.id || usuarioActual.uid || 'sistema',
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };

            const permisosCollection = collection(db, collectionName);

            // [MODIFICACIÓN]: Registrar ESCRITURA
            await consumo.registrarFirestoreEscritura(collectionName, 'nuevo permiso');

            const docRef = await addDoc(permisosCollection, permisoFirestoreData);
            const permisoId = docRef.id;

            const nuevoPermiso = new Permiso(permisoId, {
                ...permisoFirestoreData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date(),
                organizacionCamelCase: organizacion,
                creadoPor: usuarioActual.id || usuarioActual.uid,
                actualizadoPor: usuarioActual.id || usuarioActual.uid
            });

            this.permisos.unshift(nuevoPermiso);

            // 🔥 REGISTRO EN HISTORIAL
            const historial = await this._initHistorialManager();
            if (historial) {
                const modulosActivos = Object.entries(permisosIniciales)
                    .filter(([_, valor]) => valor === true)
                    .map(([modulo]) => modulo);

                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'crear',
                    modulo: 'permisos',
                    descripcion: `Configuró permisos para ${cargoNombre} en área ${areaNombre} (${modulosActivos.length} módulos)`,
                    detalles: {
                        permisoId,
                        areaId: permisoData.areaId,
                        areaNombre,
                        cargoId: permisoData.cargoId,
                        cargoNombre,
                        permisos: permisosIniciales,
                        modulosActivos
                    }
                });
            }

            return nuevoPermiso;

        } catch (error) {
            console.error('❌ Error creando permiso:', error);
            throw error;
        }
    }

    async obtenerPorOrganizacion(organizacion, usuarioActual = null) {
        try {
            const orgId = organizacion || this.organizacionCamelCase;

            if (!orgId) {
                return [];
            }

            const collectionName = this._getCollectionName(orgId);

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(collectionName, 'lista permisos');

            const permisosCollection = collection(db, collectionName);
            const permisosSnapshot = await getDocs(permisosCollection);
            const permisos = [];

            permisosSnapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const permiso = new Permiso(doc.id, {
                        ...data,
                        id: doc.id,
                        organizacionCamelCase: orgId
                    });
                    permisos.push(permiso);
                } catch (error) {
                    console.error(`Error procesando permiso ${doc.id}:`, error);
                }
            });

            permisos.sort((a, b) => b.fechaCreacion - a.fechaCreacion);
            this.permisos = permisos;

            // 🔥 REGISTRO EN HISTORIAL (solo lectura)
            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'leer',
                        modulo: 'permisos',
                        descripcion: `Consultó lista de permisos (${permisos.length} configuraciones)`,
                        detalles: { total: permisos.length }
                    });
                }
            }

            return permisos;

        } catch (error) {
            console.error('Error obteniendo permisos:', error);
            return [];
        }
    }

    async obtenerPorId(id, organizacionOverride = null) {
        const orgId = organizacionOverride || this.organizacionCamelCase;

        if (!orgId) {
            return null;
        }

        const permisoInMemory = this.permisos.find(p => p.id === id);
        if (permisoInMemory) return permisoInMemory;

        try {
            const collectionName = this._getCollectionName(orgId);
            const permisoRef = doc(db, collectionName, id);

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(collectionName, id);

            const permisoSnap = await getDoc(permisoRef);

            if (permisoSnap.exists()) {
                const data = permisoSnap.data();
                const permiso = new Permiso(id, {
                    ...data,
                    id: id,
                    organizacionCamelCase: orgId
                });
                this.permisos.push(permiso);
                return permiso;
            }

            return null;

        } catch (error) {
            console.error('Error obteniendo permiso:', error);
            return null;
        }
    }

    async obtenerPorArea(areaId, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId || !areaId) return [];

            const collectionName = this._getCollectionName(orgId);
            const permisosCollection = collection(db, collectionName);

            const q = query(permisosCollection, where("areaId", "==", areaId));

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(collectionName, `permisos por área ${areaId}`);

            const querySnapshot = await getDocs(q);
            const permisos = [];

            querySnapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const permiso = new Permiso(doc.id, {
                        ...data,
                        id: doc.id,
                        organizacionCamelCase: orgId
                    });
                    permisos.push(permiso);
                } catch (error) {
                    console.error('Error procesando permiso:', error);
                }
            });

            return permisos;

        } catch (error) {
            console.error('Error obteniendo permisos por área:', error);
            return [];
        }
    }

    async obtenerPorCargoYArea(cargoId, areaId, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId || !cargoId || !areaId) return null;

            const collectionName = this._getCollectionName(orgId);
            const permisosCollection = collection(db, collectionName);

            const q = query(
                permisosCollection,
                where("cargoId", "==", cargoId),
                where("areaId", "==", areaId)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(collectionName, `permisos por cargo ${cargoId} y área ${areaId}`);

            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                const data = doc.data();
                return new Permiso(doc.id, { ...data, id: doc.id, organizacionCamelCase: orgId });
            }

            return null;

        } catch (error) {
            console.error('Error obteniendo permiso por cargo y área:', error);
            return null;
        }
    }

    async actualizarPermiso(id, nuevosPermisos, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para actualizar permiso');
            }

            // Obtener datos actuales antes de actualizar
            const permisoActual = await this.obtenerPorId(id, organizacionCamelCase);
            const permisosAnteriores = permisoActual ? permisoActual.permisos : {};

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const permisoRef = doc(db, collectionName, id);

            const datosActualizados = {
                permisos: nuevosPermisos,
                actualizadoPor: usuarioId,
                fechaActualizacion: serverTimestamp()
            };

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(collectionName, id);

            await updateDoc(permisoRef, datosActualizados);

            const permisoIndex = this.permisos.findIndex(p => p.id === id);
            if (permisoIndex !== -1) {
                this.permisos[permisoIndex].permisos = nuevosPermisos;
                this.permisos[permisoIndex].fechaActualizacion = new Date();
                this.permisos[permisoIndex].actualizadoPor = usuarioId;
            }

            // 🔥 REGISTRO EN HISTORIAL
            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    const cambios = [];
                    const modulosActivosAntes = Object.entries(permisosAnteriores)
                        .filter(([_, valor]) => valor === true)
                        .map(([modulo]) => modulo);
                    const modulosActivosAhora = Object.entries(nuevosPermisos)
                        .filter(([_, valor]) => valor === true)
                        .map(([modulo]) => modulo);

                    if (modulosActivosAntes.join(',') !== modulosActivosAhora.join(',')) {
                        cambios.push(`módulos: [${modulosActivosAntes.join(', ')}] → [${modulosActivosAhora.join(', ')}]`);
                    }

                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'permisos',
                        descripcion: `Actualizó configuración de permisos (${modulosActivosAhora.length} módulos activos)`,
                        detalles: {
                            permisoId: id,
                            permisosAnteriores,
                            permisosNuevos: nuevosPermisos,
                            modulosActivosAntes,
                            modulosActivosAhora,
                            cambios
                        }
                    });
                }
            }

            return await this.obtenerPorId(id, organizacionCamelCase);

        } catch (error) {
            console.error('Error actualizando permiso:', error);
            throw error;
        }
    }

    async eliminarPermiso(id, usuarioActual = null, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                throw new Error('Se requiere ID de organización');
            }

            // Obtener datos antes de eliminar
            const permiso = await this.obtenerPorId(id, orgId);
            const modulosActivos = permiso ? permiso.obtenerModulosActivos() : [];

            const collectionName = this._getCollectionName(orgId);
            const permisoRef = doc(db, collectionName, id);

            // [MODIFICACIÓN]: Registrar ELIMINACIÓN
            await consumo.registrarFirestoreEliminacion(collectionName, id);

            await deleteDoc(permisoRef);

            const permisoIndex = this.permisos.findIndex(p => p.id === id);
            if (permisoIndex !== -1) {
                this.permisos.splice(permisoIndex, 1);
            }

            // 🔥 REGISTRO EN HISTORIAL
            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'eliminar',
                        modulo: 'permisos',
                        descripcion: `Eliminó configuración de permisos (${modulosActivos.length} módulos)`,
                        detalles: {
                            permisoId: id,
                            modulosActivos
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error eliminando permiso:', error);
            throw error;
        }
    }

    async verificarExistente(areaId, cargoId, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) return false;

            const collectionName = this._getCollectionName(orgId);
            const permisosCollection = collection(db, collectionName);

            const q = query(
                permisosCollection,
                where("areaId", "==", areaId),
                where("cargoId", "==", cargoId)
            );

            // [MODIFICACIÓN]: Registrar LECTURA (aunque ya se registró antes, pero por si se llama solo)
            await consumo.registrarFirestoreLectura(collectionName, `verificar permiso área ${areaId} cargo ${cargoId}`);

            const querySnapshot = await getDocs(q);
            return !querySnapshot.empty;

        } catch (error) {
            console.error('Error verificando permiso:', error);
            return false;
        }
    }

    async cargarTodosPermisos() {
        return await this.obtenerPorOrganizacion(this.organizacionCamelCase);
    }

    async obtenerTodos() {
        if (this.permisos.length === 0) {
            return await this.cargarTodosPermisos();
        }
        return this.permisos;
    }

    async obtenerEstadisticas() {
        const permisos = await this.obtenerTodos();
        const total = permisos.length;
        const conAcceso = permisos.filter(p => p.tieneAlgunModulo()).length;
        const sinAcceso = total - conAcceso;

        // MÓDULOS ACTUALIZADOS: Incluir todos los módulos
        const modulos = ['areas', 'categorias', 'sucursales', 'regiones', 'incidencias', 'usuarios', 'estadisticas', 'tareas', 'permisos', 'loginMonitoreo'];

        const estadisticasPorModulo = {};

        modulos.forEach(modulo => {
            const conPermiso = permisos.filter(p => p.puedeAcceder(modulo)).length;
            estadisticasPorModulo[modulo] = {
                activos: conPermiso,
                inactivos: total - conPermiso,
                porcentaje: Math.round((conPermiso / total) * 100) || 0
            };
        });

        return {
            totalPermisos: total,
            usuariosConAcceso: conAcceso,
            usuariosSinAcceso: sinAcceso,
            porcentajeConAcceso: Math.round((conAcceso / total) * 100) || 0,
            estadisticasPorModulo
        };
    }
}

export { Permiso, PermisoManager };