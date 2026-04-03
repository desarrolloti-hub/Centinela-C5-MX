// sucursal.js - VERSIÓN COMPLETA CON HISTORIAL DE ACTIVIDADES Y REGISTRO DE CONSUMO FIREBASE

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
    orderBy,
    limit,
    startAfter,
    getCountFromServer,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from '/config/firebase-config.js';

// [MODIFICACIÓN 1]: Importar la instancia de consumo
import consumo from '/clases/consumoFirebase.js';

let regionManagerInstance = null;

async function getRegionManager() {
    if (!regionManagerInstance) {
        const { RegionManager } = await import('/clases/region.js');
        regionManagerInstance = new RegionManager();
    }
    return regionManagerInstance;
}

class Sucursal {
    constructor(id, data) {
        this.id = id;
        
        this.nombre = data.nombre || '';
        this.tipo = data.tipo || '';
        this.contacto = data.contacto || '';
        
        this.direccion = data.direccion || '';
        this.ciudad = data.ciudad || '';
        this.estado = data.estado || '';
        this.zona = data.zona || '';
        
        this.regionId = data.regionId || '';
        
        this.latitud = data.latitud || '';
        this.longitud = data.longitud || '';
        
        // [MODIFICACIÓN NUEVA]: Números de emergencia
        this.numerosEmergencia = data.numerosEmergencia || {};
        
        this.organizacionCamelCase = data.organizacionCamelCase || '';
        this.creadoPor = data.creadoPor || '';
        this.creadoPorEmail = data.creadoPorEmail || '';
        this.creadoPorNombre = data.creadoPorNombre || '';
        this.actualizadoPor = data.actualizadoPor || '';
        
        this.fechaCreacion = this._convertirFecha(data.fechaCreacion) || new Date();
        this.fechaActualizacion = this._convertirFecha(data.fechaActualizacion) || new Date();
        
        this._regionCache = null;
    }

    _convertirFecha(fecha) {
        if (!fecha) return null;
        if (fecha && typeof fecha.toDate === 'function') return fecha.toDate();
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'string' || typeof fecha === 'number') {
            const date = new Date(fecha);
            if (!isNaN(date.getTime())) return date;
        }
        if (fecha && typeof fecha === 'object' && 'seconds' in fecha) {
            return new Date(fecha.seconds * 1000);
        }
        return null;
    }

    _formatearFecha(date) {
        if (!date) return 'No disponible';
        try {
            const fecha = this._convertirFecha(date);
            return fecha.toLocaleDateString('es-MX', {
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit', 
                minute: '2-digit'
            });
        } catch {
            return 'Fecha inválida';
        }
    }
    
    async getRegion(forceRefresh = false) {
        if (!this.regionId) return null;
        
        if (!this._regionCache || forceRefresh) {
            try {
                const regionManager = await getRegionManager();
                const region = await regionManager.getRegionById(
                    this.regionId, 
                    this.organizacionCamelCase
                );
                this._regionCache = region;
            } catch (error) {
                console.error('Error obteniendo región:', error);
                return null;
            }
        }
        
        return this._regionCache;
    }

    async getRegionNombre() {
        const region = await this.getRegion();
        return region?.nombre || 'No especificada';
    }

    async getRegionInfo() {
        const region = await this.getRegion();
        return {
            id: this.regionId,
            nombre: region?.nombre || 'No especificada',
            color: region?.color || '#808080'
        };
    }

    getUbicacionCompleta() {
        const partes = [];
        if (this.direccion) partes.push(this.direccion);
        if (this.ciudad) partes.push(this.ciudad);
        if (this.estado) partes.push(this.estado);
        if (this.zona) partes.push(`Zona: ${this.zona}`);
        return partes.join(', ') || 'Ubicación no disponible';
    }

    getCoordenadas() {
        return {
            lat: this.latitud,
            lng: this.longitud
        };
    }

    tieneCoordenadas() {
        return this.latitud && this.longitud;
    }

    getContactoFormateado() {
        if (!this.contacto) return 'No disponible';
        const telefono = this.contacto.replace(/\D/g, '');
        if (telefono.length === 10) {
            return `${telefono.slice(0,3)} ${telefono.slice(3,6)} ${telefono.slice(6)}`;
        }
        return this.contacto;
    }

    // [MODIFICACIÓN NUEVA]: Métodos para números de emergencia
    getNumerosEmergencia() {
        return this.numerosEmergencia || {};
    }

    tieneNumerosEmergencia() {
        return this.numerosEmergencia && Object.keys(this.numerosEmergencia).length > 0;
    }

    getNumeroEmergenciaPorServicio(servicio) {
        if (!this.numerosEmergencia || !this.numerosEmergencia[servicio]) {
            return null;
        }
        return this.numerosEmergencia[servicio];
    }

    agregarNumeroEmergencia(servicio, numero) {
        if (!servicio || !numero) return false;
        
        if (!this.numerosEmergencia) {
            this.numerosEmergencia = {};
        }
        
        this.numerosEmergencia[servicio] = numero;
        return true;
    }

    eliminarNumeroEmergencia(servicio) {
        if (!this.numerosEmergencia || !this.numerosEmergencia[servicio]) {
            return false;
        }
        
        delete this.numerosEmergencia[servicio];
        
        // Si el objeto quedó vacío, lo establecemos como objeto vacío
        if (Object.keys(this.numerosEmergencia).length === 0) {
            this.numerosEmergencia = {};
        }
        
        return true;
    }

    getFechaCreacionFormateada() {
        return this._formatearFecha(this.fechaCreacion);
    }

    getFechaActualizacionFormateada() {
        return this._formatearFecha(this.fechaActualizacion);
    }

    getCreadoPorInfo() {
        return {
            id: this.creadoPor,
            email: this.creadoPorEmail,
            nombre: this.creadoPorNombre
        };
    }

    toFirestore() {
        return {
            nombre: this.nombre,
            tipo: this.tipo,
            contacto: this.contacto,
            direccion: this.direccion,
            ciudad: this.ciudad,
            estado: this.estado,
            zona: this.zona,
            regionId: this.regionId,
            latitud: this.latitud,
            longitud: this.longitud,
            numerosEmergencia: this.numerosEmergencia, // [MODIFICACIÓN NUEVA]
            organizacionCamelCase: this.organizacionCamelCase,
            creadoPor: this.creadoPor,
            creadoPorEmail: this.creadoPorEmail,
            creadoPorNombre: this.creadoPorNombre,
            actualizadoPor: this.actualizadoPor,
            fechaCreacion: this.fechaCreacion,
            fechaActualizacion: this.fechaActualizacion
        };
    }

    async toUI() {
        const regionInfo = await this.getRegionInfo();
        
        return {
            id: this.id,
            nombre: this.nombre,
            tipo: this.tipo,
            contacto: this.contacto,
            contactoFormateado: this.getContactoFormateado(),
            direccion: this.direccion,
            ciudad: this.ciudad,
            estado: this.estado,
            zona: this.zona,
            ubicacionCompleta: this.getUbicacionCompleta(),
            regionId: this.regionId,
            region: regionInfo,
            latitud: this.latitud,
            longitud: this.longitud,
            coordenadas: this.getCoordenadas(),
            tieneCoordenadas: this.tieneCoordenadas(),
            numerosEmergencia: this.getNumerosEmergencia(), // [MODIFICACIÓN NUEVA]
            tieneNumerosEmergencia: this.tieneNumerosEmergencia(), // [MODIFICACIÓN NUEVA]
            fechaCreacion: this.getFechaCreacionFormateada(),
            fechaActualizacion: this.getFechaActualizacionFormateada(),
            creadoPor: this.creadoPorNombre || this.creadoPorEmail,
            organizacionCamelCase: this.organizacionCamelCase
        };
    }

    toJSON() {
        return {
            id: this.id,
            ...this.toFirestore()
        };
    }
}

class SucursalManager {
    constructor() {
        this.sucursales = [];
        this.cache = new Map();
        this.historialManager = null;
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

    _getCollectionName(organizacionCamelCase) {
        return `sucursales_${organizacionCamelCase}`;
    }

    _validarDatosSucursal(sucursalData) {
        const errores = [];

        if (!sucursalData.nombre?.trim()) {
            errores.push('El nombre de la sucursal es obligatorio');
        }

        if (!sucursalData.tipo) {
            errores.push('El tipo de sucursal es obligatorio');
        }

        if (!sucursalData.regionId) {
            errores.push('Debe seleccionar una región');
        }

        if (!sucursalData.estado) {
            errores.push('Debe seleccionar un estado');
        }

        if (!sucursalData.ciudad?.trim()) {
            errores.push('La ciudad es obligatoria');
        }

        if (!sucursalData.direccion?.trim()) {
            errores.push('La dirección es obligatoria');
        }

        if (!sucursalData.contacto?.trim()) {
            errores.push('El teléfono de contacto es obligatorio');
        } else {
            const telefono = sucursalData.contacto.replace(/\D/g, '');
            if (telefono.length < 10) {
                errores.push('El teléfono debe tener al menos 10 dígitos');
            }
        }

        // [MODIFICACIÓN NUEVA]: Los números de emergencia NO son obligatorios, no se validan
        // Solo se valida si existen, que sea un objeto
        if (sucursalData.numerosEmergencia && typeof sucursalData.numerosEmergencia !== 'object') {
            errores.push('Los números de emergencia deben ser un objeto válido');
        }

        return errores;
    }

    async crearSucursal(sucursalData, userManager) {
        try {
            const usuarioActual = userManager.currentUser;
            
            if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
                throw new Error('Usuario no tiene organización asignada');
            }

            const errores = this._validarDatosSucursal(sucursalData);
            if (errores.length > 0) {
                throw new Error(errores.join('\n'));
            }

            const organizacion = usuarioActual.organizacionCamelCase;
            const collectionName = this._getCollectionName(organizacion);

            // [MODIFICACIÓN 2]: Registrar LECTURA antes de verificar existencia
            await consumo.registrarFirestoreLectura(collectionName, 'verificar nombre');

            const existe = await this.verificarSucursalExistente(sucursalData.nombre, organizacion);
            if (existe) {
                throw new Error('Ya existe una sucursal con ese nombre');
            }

            // Obtener nombre de la región para el historial
            let regionNombre = 'Desconocida';
            try {
                const regionManager = await getRegionManager();
                const region = await regionManager.getRegionById(sucursalData.regionId, organizacion);
                regionNombre = region ? region.nombre : 'Desconocida';
            } catch (e) {
                console.warn('No se pudo obtener nombre de la región:', e);
            }

            const sucursalesCollection = collection(db, collectionName);

            const sucursalFirestoreData = {
                nombre: sucursalData.nombre.trim(),
                tipo: sucursalData.tipo,
                contacto: sucursalData.contacto.trim(),
                direccion: sucursalData.direccion.trim(),
                ciudad: sucursalData.ciudad.trim(),
                estado: sucursalData.estado,
                zona: sucursalData.zona || '',
                regionId: sucursalData.regionId,
                latitud: sucursalData.latitud || '',
                longitud: sucursalData.longitud || '',
                numerosEmergencia: sucursalData.numerosEmergencia || {}, // [MODIFICACIÓN NUEVA]
                organizacionCamelCase: organizacion,
                creadoPor: usuarioActual.id,
                creadoPorEmail: usuarioActual.correo || usuarioActual.email || '',
                creadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.nombre || '',
                actualizadoPor: usuarioActual.id,
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };

            // [MODIFICACIÓN 3]: Registrar ESCRITURA antes de addDoc
            await consumo.registrarFirestoreEscritura(collectionName, 'nueva sucursal');

            const docRef = await addDoc(sucursalesCollection, sucursalFirestoreData);

            const nuevaSucursal = new Sucursal(docRef.id, {
                ...sucursalFirestoreData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date()
            });

            this.sucursales.unshift(nuevaSucursal);
            this.cache.set(docRef.id, nuevaSucursal);

            // 🔥 REGISTRO EN HISTORIAL
            const historial = await this._initHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'crear',
                    modulo: 'sucursales',
                    descripcion: historial.generarDescripcion('crear', 'sucursales', {
                        nombre: sucursalData.nombre,
                        ciudad: sucursalData.ciudad,
                        estado: sucursalData.estado,
                        region: regionNombre
                    }),
                    detalles: {
                        sucursalId: docRef.id,
                        nombre: sucursalData.nombre,
                        tipo: sucursalData.tipo,
                        ciudad: sucursalData.ciudad,
                        estado: sucursalData.estado,
                        regionId: sucursalData.regionId,
                        regionNombre,
                        numerosEmergencia: sucursalData.numerosEmergencia || {} // [MODIFICACIÓN NUEVA]
                    }
                });
            }

            return nuevaSucursal;

        } catch (error) {
            console.error('Error creando sucursal:', error);
            throw error;
        }
    }

    async getSucursalesByOrganizacion(organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) return [];

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const sucursalesCollection = collection(db, collectionName);
            
            const sucursalesQuery = query(
                sucursalesCollection,
                orderBy("fechaCreacion", "desc")
            );

            // [MODIFICACIÓN 4]: Registrar LECTURA antes de getDocs
            await consumo.registrarFirestoreLectura(collectionName, 'lista sucursales');

            const snapshot = await getDocs(sucursalesQuery);
            const sucursales = [];

            snapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const sucursal = new Sucursal(doc.id, data);
                    sucursales.push(sucursal);
                    this.cache.set(doc.id, sucursal);
                } catch (error) {
                    console.error('Error procesando sucursal:', error);
                }
            });

            this.sucursales = sucursales;

            // 🔥 REGISTRO EN HISTORIAL (solo lectura)
            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'leer',
                        modulo: 'sucursales',
                        descripcion: `Consultó lista de sucursales (${sucursales.length} sucursales)`,
                        detalles: { total: sucursales.length }
                    });
                }
            }

            return sucursales;

        } catch (error) {
            console.error('Error obteniendo sucursales:', error);
            return [];
        }
    }

    async getSucursalById(sucursalId, organizacionCamelCase) {
        if (this.cache.has(sucursalId)) {
            return this.cache.get(sucursalId);
        }

        if (!organizacionCamelCase) return null;

        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const sucursalRef = doc(db, collectionName, sucursalId);

            // [MODIFICACIÓN 5]: Registrar LECTURA antes de getDoc
            await consumo.registrarFirestoreLectura(collectionName, sucursalId);

            const sucursalSnap = await getDoc(sucursalRef);

            if (sucursalSnap.exists()) {
                const data = sucursalSnap.data();
                const sucursal = new Sucursal(sucursalId, data);
                
                this.cache.set(sucursalId, sucursal);
                
                const index = this.sucursales.findIndex(s => s.id === sucursalId);
                if (index === -1) {
                    this.sucursales.push(sucursal);
                } else {
                    this.sucursales[index] = sucursal;
                }
                
                return sucursal;
            }
            return null;

        } catch (error) {
            console.error('Error obteniendo sucursal por ID:', error);
            return null;
        }
    }

    async actualizarSucursal(sucursalId, nuevosDatos, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para actualizar sucursal');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const sucursalRef = doc(db, collectionName, sucursalId);

            // [MODIFICACIÓN 6]: Registrar LECTURA antes de getDoc
            await consumo.registrarFirestoreLectura(collectionName, sucursalId);

            const sucursalSnap = await getDoc(sucursalRef);

            if (!sucursalSnap.exists()) {
                throw new Error(`Sucursal con ID ${sucursalId} no encontrada`);
            }

            const datosActuales = sucursalSnap.data();

            if (nuevosDatos.nombre && nuevosDatos.nombre !== datosActuales.nombre) {
                // [MODIFICACIÓN 7]: Registrar LECTURA para verificar nombre
                await consumo.registrarFirestoreLectura(collectionName, 'verificar nombre');

                const existe = await this.verificarSucursalExistente(
                    nuevosDatos.nombre, 
                    organizacionCamelCase,
                    sucursalId
                );
                if (existe) {
                    throw new Error('Ya existe otra sucursal con este nombre');
                }
            }

            // Obtener nombres para el historial
            let regionNombreActual = 'Desconocida';
            let regionNombreNuevo = 'Desconocida';
            try {
                const regionManager = await getRegionManager();
                if (datosActuales.regionId) {
                    const regionActual = await regionManager.getRegionById(datosActuales.regionId, organizacionCamelCase);
                    regionNombreActual = regionActual ? regionActual.nombre : 'Desconocida';
                }
                if (nuevosDatos.regionId) {
                    const regionNueva = await regionManager.getRegionById(nuevosDatos.regionId, organizacionCamelCase);
                    regionNombreNuevo = regionNueva ? regionNueva.nombre : 'Desconocida';
                }
            } catch (e) {
                console.warn('No se pudo obtener nombre de región:', e);
            }

            const datosActualizados = {
                ...(nuevosDatos.nombre && { nombre: nuevosDatos.nombre }),
                ...(nuevosDatos.tipo && { tipo: nuevosDatos.tipo }),
                ...(nuevosDatos.contacto && { contacto: nuevosDatos.contacto }),
                ...(nuevosDatos.direccion && { direccion: nuevosDatos.direccion }),
                ...(nuevosDatos.ciudad && { ciudad: nuevosDatos.ciudad }),
                ...(nuevosDatos.estado && { estado: nuevosDatos.estado }),
                ...(nuevosDatos.zona !== undefined && { zona: nuevosDatos.zona }),
                ...(nuevosDatos.regionId && { regionId: nuevosDatos.regionId }),
                ...(nuevosDatos.latitud !== undefined && { latitud: nuevosDatos.latitud }),
                ...(nuevosDatos.longitud !== undefined && { longitud: nuevosDatos.longitud }),
                // [MODIFICACIÓN NUEVA]: Actualizar números de emergencia si se proporcionan
                ...(nuevosDatos.numerosEmergencia !== undefined && { numerosEmergencia: nuevosDatos.numerosEmergencia }),
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId
            };

            // [MODIFICACIÓN 8]: Registrar ACTUALIZACIÓN antes de updateDoc
            await consumo.registrarFirestoreActualizacion(collectionName, sucursalId);

            await updateDoc(sucursalRef, datosActualizados);

            this.cache.delete(sucursalId);
            
            const index = this.sucursales.findIndex(s => s.id === sucursalId);
            if (index !== -1) {
                const sucursalActual = this.sucursales[index];
                Object.assign(sucursalActual, datosActualizados);
                sucursalActual.fechaActualizacion = new Date();
                this.cache.set(sucursalId, sucursalActual);
            }

            // 🔥 REGISTRO EN HISTORIAL
            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    const cambios = [];
                    if (datosActuales.nombre !== nuevosDatos.nombre) {
                        cambios.push(`nombre: "${datosActuales.nombre}" → "${nuevosDatos.nombre}"`);
                    }
                    if (datosActuales.ciudad !== nuevosDatos.ciudad) {
                        cambios.push(`ciudad: "${datosActuales.ciudad}" → "${nuevosDatos.ciudad}"`);
                    }
                    if (datosActuales.regionId !== nuevosDatos.regionId) {
                        cambios.push(`región: "${regionNombreActual}" → "${regionNombreNuevo}"`);
                    }
                    // [MODIFICACIÓN NUEVA]: Registrar cambios en números de emergencia
                    if (nuevosDatos.numerosEmergencia !== undefined) {
                        const tieneCambios = JSON.stringify(datosActuales.numerosEmergencia || {}) !== 
                                           JSON.stringify(nuevosDatos.numerosEmergencia || {});
                        if (tieneCambios) {
                            cambios.push('números de emergencia actualizados');
                        }
                    }

                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'sucursales',
                        descripcion: historial.generarDescripcion('editar', 'sucursales', {
                            nombre: nuevosDatos.nombre || datosActuales.nombre,
                            nombreOriginal: datosActuales.nombre,
                            cambios: cambios.join(', ')
                        }),
                        detalles: {
                            sucursalId,
                            nombre: nuevosDatos.nombre || datosActuales.nombre,
                            nombreOriginal: datosActuales.nombre,
                            ciudad: nuevosDatos.ciudad || datosActuales.ciudad,
                            estado: nuevosDatos.estado || datosActuales.estado,
                            regionId: nuevosDatos.regionId || datosActuales.regionId,
                            regionNombre: regionNombreNuevo,
                            numerosEmergencia: nuevosDatos.numerosEmergencia || datosActuales.numerosEmergencia, // [MODIFICACIÓN NUEVA]
                            cambios
                        }
                    });
                }
            }

            return await this.getSucursalById(sucursalId, organizacionCamelCase);

        } catch (error) {
            console.error('Error actualizando sucursal:', error);
            throw error;
        }
    }

    async eliminarSucursal(sucursalId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para eliminar sucursal');
            }

            // Obtener datos antes de eliminar
            const sucursal = await this.getSucursalById(sucursalId, organizacionCamelCase);
            const nombreSucursal = sucursal ? sucursal.nombre : 'Sucursal desconocida';
            const ciudadSucursal = sucursal ? sucursal.ciudad : '';

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const sucursalRef = doc(db, collectionName, sucursalId);

            // [MODIFICACIÓN 9]: Registrar ELIMINACIÓN antes de deleteDoc
            await consumo.registrarFirestoreEliminacion(collectionName, sucursalId);

            await deleteDoc(sucursalRef);

            this.cache.delete(sucursalId);
            
            const index = this.sucursales.findIndex(s => s.id === sucursalId);
            if (index !== -1) {
                this.sucursales.splice(index, 1);
            }

            // 🔥 REGISTRO EN HISTORIAL
            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'eliminar',
                        modulo: 'sucursales',
                        descripcion: historial.generarDescripcion('eliminar', 'sucursales', {
                            nombre: nombreSucursal,
                            ciudad: ciudadSucursal
                        }),
                        detalles: {
                            sucursalId,
                            nombre: nombreSucursal,
                            ciudad: ciudadSucursal
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error eliminando sucursal:', error);
            throw error;
        }
    }

    async verificarSucursalExistente(nombre, organizacionCamelCase, excluirId = null) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const sucursalesCollection = collection(db, collectionName);
            
            const q = query(
                sucursalesCollection,
                where("nombre", "==", nombre)
            );
            
            // [MODIFICACIÓN 10]: Registrar LECTURA antes de getDocs
            await consumo.registrarFirestoreLectura(collectionName, 'verificar nombre');

            const snapshot = await getDocs(q);
            
            if (snapshot.empty) return false;
            
            if (excluirId) {
                for (const doc of snapshot.docs) {
                    if (doc.id !== excluirId) {
                        return true;
                    }
                }
                return false;
            }
            
            return !snapshot.empty;

        } catch (error) {
            console.error('Error verificando sucursal:', error);
            return false;
        }
    }

    async getSucursalesByRegion(regionId, organizacionCamelCase) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const sucursalesCollection = collection(db, collectionName);
            
            const q = query(
                sucursalesCollection,
                where("regionId", "==", regionId)
            );
            
            // [MODIFICACIÓN 11]: Registrar LECTURA antes de getDocs
            await consumo.registrarFirestoreLectura(collectionName, 'sucursales por región');

            const snapshot = await getDocs(q);
            const sucursales = [];

            snapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const sucursal = new Sucursal(doc.id, data);
                    sucursales.push(sucursal);
                } catch (error) {
                    console.error('Error procesando sucursal:', error);
                }
            });

            return sucursales;

        } catch (error) {
            console.error('Error obteniendo sucursales por región:', error);
            return [];
        }
    }

    async buscarSucursalesPorNombre(termino, organizacionCamelCase) {
        try {
            const sucursales = await this.getSucursalesByOrganizacion(organizacionCamelCase);
            
            const terminoLower = termino.toLowerCase();
            return sucursales.filter(sucursal => 
                sucursal.nombre.toLowerCase().includes(terminoLower) ||
                sucursal.ciudad.toLowerCase().includes(terminoLower) ||
                sucursal.direccion.toLowerCase().includes(terminoLower)
            );

        } catch (error) {
            console.error('Error buscando sucursales:', error);
            return [];
        }
    }

    async getSucursalesConCoordenadas(organizacionCamelCase) {
        try {
            const todas = await this.getSucursalesByOrganizacion(organizacionCamelCase);
            return todas.filter(s => s.tieneCoordenadas());

        } catch (error) {
            console.error('Error obteniendo sucursales con coordenadas:', error);
            return [];
        }
    }

    async getTotalSucursales(organizacionCamelCase) {
        try {
            const sucursales = await this.getSucursalesByOrganizacion(organizacionCamelCase);
            return sucursales.length;
        } catch (error) {
            console.error('Error obteniendo total de sucursales:', error);
            return 0;
        }
    }
    // Agregar este método a la clase SucursalManager (después del método getTotalSucursales)

    /**
     * Obtiene el número de colaboradores asignados a una sucursal
     * @param {string} sucursalId - ID de la sucursal
     * @param {string} organizacionCamelCase - Organización en camelCase
     * @returns {Promise<number>} - Número de colaboradores asignados
     */
    async getColaboradoresPorSucursal(sucursalId, organizacionCamelCase) {
        try {
            if (!sucursalId || !organizacionCamelCase) return 0;

            const coleccionColaboradores = `colaboradores_${organizacionCamelCase}`;
            
            const q = query(
                collection(db, coleccionColaboradores),
                where("sucursalAsignadaId", "==", sucursalId),
                where("status", "==", true)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccionColaboradores, `colaboradores por sucursal ${sucursalId}`);

            const snapshot = await getDocs(q);
            return snapshot.size;

        } catch (error) {
            console.error('Error obteniendo colaboradores por sucursal:', error);
            return 0;
        }
    }

    /**
     * Verifica si una sucursal puede recibir más colaboradores
     * @param {string} sucursalId - ID de la sucursal
     * @param {string} organizacionCamelCase - Organización en camelCase
     * @returns {Promise<boolean>} - true si se puede asignar, false si ya tiene 2 colaboradores
     */
    async puedeAsignarColaborador(sucursalId, organizacionCamelCase) {
        const colaboradores = await this.getColaboradoresPorSucursal(sucursalId, organizacionCamelCase);
        return colaboradores < 2;
    }

    // Agregar estos métodos a la clase SucursalManager en sucursal.js
    // Agregar estos métodos a la clase SucursalManager en sucursal.js (después del método getTotalSucursales)

async getSucursalesPaginadas(organizacionCamelCase, filtros = {}, pagina = 1, itemsPorPagina = 10, cursores = null) {
    try {
        if (!organizacionCamelCase) {
            throw new Error('Organización no especificada');
        }

        const collectionName = this._getCollectionName(organizacionCamelCase);
        const sucursalesCollection = collection(db, collectionName);
        
        let constraints = [orderBy("fechaCreacion", "desc")];
        
        // Búsqueda por nombre (usando índice nombre + organizacionCamelCase)
        if (filtros.termino && filtros.termino.length >= 2) {
            constraints.push(where("nombre", ">=", filtros.termino));
            constraints.push(where("nombre", "<=", filtros.termino + '\uf8ff'));
        }
        
        // Paginación hacia adelante
        if (pagina > 1 && cursores?.ultimoDocumento) {
            constraints.push(startAfter(cursores.ultimoDocumento));
        }
        
        constraints.push(limit(itemsPorPagina));
        
        const q = query(sucursalesCollection, ...constraints);
        
        await consumo.registrarFirestoreLectura(collectionName, `página ${pagina}`);
        const snapshot = await getDocs(q);
        
        const sucursales = [];
        let ultimoDoc = null;
        let primerDoc = null;
        
        if (!snapshot.empty) {
            ultimoDoc = snapshot.docs[snapshot.docs.length - 1];
            primerDoc = snapshot.docs[0];
            
            snapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const sucursal = new Sucursal(doc.id, {
                        ...data,
                        id: doc.id,
                        fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion,
                        fechaActualizacion: data.fechaActualizacion?.toDate?.() || data.fechaActualizacion
                    });
                    sucursales.push(sucursal);
                } catch (error) {
                    console.error('Error procesando sucursal:', error);
                }
            });
        }
        
        // Contar total (con o sin filtro)
        let total = 0;
        if (filtros.termino && filtros.termino.length >= 2) {
            const countQuery = query(sucursalesCollection, 
                where("nombre", ">=", filtros.termino),
                where("nombre", "<=", filtros.termino + '\uf8ff')
            );
            const countSnapshot = await getCountFromServer(countQuery);
            total = countSnapshot.data().count;
        } else {
            const countQuery = query(sucursalesCollection);
            const countSnapshot = await getCountFromServer(countQuery);
            total = countSnapshot.data().count;
        }
        
        return {
            sucursales,
            total,
            paginaActual: pagina,
            totalPaginas: Math.ceil(total / itemsPorPagina),
            ultimoDocumento: ultimoDoc,
            primerDocumento: primerDoc,
            tieneMas: snapshot.docs.length === itemsPorPagina
        };
        
    } catch (error) {
        console.error('Error obteniendo sucursales paginadas:', error);
        return {
            sucursales: [],
            total: 0,
            paginaActual: pagina,
            totalPaginas: 0,
            ultimoDocumento: null,
            primerDocumento: null,
            tieneMas: false
        };
    }
}

async getSucursalesPaginaEspecifica(organizacionCamelCase, filtros = {}, paginaDeseada = 1, itemsPorPagina = 10) {
    try {
        if (paginaDeseada === 1) {
            return await this.getSucursalesPaginadas(organizacionCamelCase, filtros, 1, itemsPorPagina);
        }
        
        const collectionName = this._getCollectionName(organizacionCamelCase);
        const sucursalesCollection = collection(db, collectionName);
        
        let constraints = [orderBy("fechaCreacion", "desc")];
        
        if (filtros.termino && filtros.termino.length >= 2) {
            constraints.push(where("nombre", ">=", filtros.termino));
            constraints.push(where("nombre", "<=", filtros.termino + '\uf8ff'));
        }
        
        // Para páginas específicas, necesitamos saltar documentos
        // Esto requiere una consulta adicional para obtener los documentos hasta la página deseada
        if (paginaDeseada > 1) {
            // Primero obtenemos los documentos hasta la página anterior
            const skipQuery = query(sucursalesCollection, ...constraints, limit((paginaDeseada - 1) * itemsPorPagina));
            const skipSnapshot = await getDocs(skipQuery);
            
            if (skipSnapshot.empty) {
                return {
                    sucursales: [],
                    total: 0,
                    paginaActual: paginaDeseada,
                    totalPaginas: 0,
                    ultimoDocumento: null,
                    primerDocumento: null,
                    tieneMas: false
                };
            }
            
            const lastDoc = skipSnapshot.docs[skipSnapshot.docs.length - 1];
            constraints.push(startAfter(lastDoc));
        }
        
        constraints.push(limit(itemsPorPagina));
        
        const q = query(sucursalesCollection, ...constraints);
        
        await consumo.registrarFirestoreLectura(collectionName, `página específica ${paginaDeseada}`);
        const snapshot = await getDocs(q);
        
        const sucursales = [];
        let ultimoDoc = null;
        let primerDoc = null;
        
        if (!snapshot.empty) {
            ultimoDoc = snapshot.docs[snapshot.docs.length - 1];
            primerDoc = snapshot.docs[0];
            
            snapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const sucursal = new Sucursal(doc.id, {
                        ...data,
                        id: doc.id,
                        fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion,
                        fechaActualizacion: data.fechaActualizacion?.toDate?.() || data.fechaActualizacion
                    });
                    sucursales.push(sucursal);
                } catch (error) {
                    console.error('Error procesando sucursal:', error);
                }
            });
        }
        
        // Contar total
        let total = 0;
        if (filtros.termino && filtros.termino.length >= 2) {
            const countQuery = query(sucursalesCollection, 
                where("nombre", ">=", filtros.termino),
                where("nombre", "<=", filtros.termino + '\uf8ff')
            );
            const countSnapshot = await getCountFromServer(countQuery);
            total = countSnapshot.data().count;
        } else {
            const countQuery = query(sucursalesCollection);
            const countSnapshot = await getCountFromServer(countQuery);
            total = countSnapshot.data().count;
        }
        
        return {
            sucursales,
            total,
            paginaActual: paginaDeseada,
            totalPaginas: Math.ceil(total / itemsPorPagina),
            ultimoDocumento: ultimoDoc,
            primerDocumento: primerDoc,
            tieneMas: snapshot.docs.length === itemsPorPagina
        };
        
    } catch (error) {
        console.error('Error obteniendo página específica:', error);
        return {
            sucursales: [],
            total: 0,
            paginaActual: paginaDeseada,
            totalPaginas: 0,
            ultimoDocumento: null,
            primerDocumento: null,
            tieneMas: false
        };
    }
}
}

const ESTADOS_MEXICO = [
    'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
    'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima',
    'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo',
    'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca',
    'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
    'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán',
    'Zacatecas'
];

export { 
    Sucursal, 
    SucursalManager,
    ESTADOS_MEXICO
};