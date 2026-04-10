import { db } from '/config/firebase-config.js';
import { 
    doc, 
    setDoc, 
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    orderBy,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

class CuentaPM {
    constructor(email, data = {}) {
        this._id = email; 
        this._email = email;
        this._userToken = data.userToken || '';
        this._appId = data.appId || this._generateAppId();
        this._organizacion = data.organizacion || ''; 
        this._organizacionCamelCase = data.organizacionCamelCase || '';
        this._status = data.status || 'pendiente';
        this._fechaCreacion = data.fechaCreacion || new Date();
        this._fechaActualizacion = data.fechaActualizacion || new Date();
        
        // ========== NUEVOS CAMPOS ==========
        this._password = data.password || '';
        this._panelPassword = data.panelPassword || '';
        this._panelTokens = data.panelTokens || [];
    }

    // ========== GETTERS Y SETTERS EXISTENTES ==========
    get id() { return this._id; }
    set id(value) { this._id = value; }

    get email() { return this._email; }
    set email(value) { this._email = value; }

    get userToken() { return this._userToken; }
    set userToken(value) { this._userToken = value; }

    get appId() { return this._appId; }
    set appId(value) { this._appId = value; }

    get organizacion() { return this._organizacion; }
    set organizacion(value) { this._organizacion = value; }

    get organizacionCamelCase() { return this._organizacionCamelCase; }
    set organizacionCamelCase(value) { this._organizacionCamelCase = value; }

    get status() { return this._status; }
    set status(value) { this._status = value; }

    get fechaCreacion() { return this._fechaCreacion; }
    set fechaCreacion(value) { this._fechaCreacion = value; }

    get fechaActualizacion() { return this._fechaActualizacion; }
    set fechaActualizacion(value) { this._fechaActualizacion = value; }

    // ========== NUEVOS GETTERS Y SETTERS ==========
    get password() { return this._password; }
    set password(value) { this._password = value; }

    get panelPassword() { return this._panelPassword; }
    set panelPassword(value) { this._panelPassword = value; }

    get panelTokens() { return this._panelTokens; }
    set panelTokens(value) { this._panelTokens = value; }

    // ========== MÉTODOS PRIVADOS ==========
    _generateAppId() {
        // Genera ID único de 8 caracteres para la app
        return Math.random().toString(16).substring(2, 10);
    }

    _toFirestore() {
        return {
            email: this._email,
            userToken: this._userToken,
            appId: this._appId,
            organizacion: this._organizacion,
            organizacionCamelCase: this._organizacionCamelCase,
            status: this._status,
            fechaCreacion: this._fechaCreacion instanceof Date ? this._fechaCreacion : new Date(this._fechaCreacion),
            fechaActualizacion: new Date(),
            // ========== NUEVOS CAMPOS EN FIRESTORE ==========
            password: this._password,
            panelPassword: this._panelPassword,
            panelTokens: this._panelTokens
        };
    }

    static _fromFirestore(doc) {
        if (!doc.exists()) return null;
        
        const data = doc.data();
        // Crear la cuenta con el constructor correcto
        const cuenta = new CuentaPM(data.email || doc.id, {
            userToken: data.userToken,
            appId: data.appId,
            organizacion: data.organizacion,
            organizacionCamelCase: data.organizacionCamelCase,
            status: data.status,
            fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion,
            fechaActualizacion: data.fechaActualizacion?.toDate?.() || data.fechaActualizacion,
            // ========== NUEVOS CAMPOS ==========
            password: data.password || '',
            panelPassword: data.panelPassword || '',
            panelTokens: data.panelTokens || []
        });
        
        // Asegurar que el ID sea el correcto
        cuenta._id = doc.id;
        
        return cuenta;
    }

    // ========== MÉTODOS CRUD ==========
    
    /**
     * Guarda la cuenta en Firestore
     * @returns {Promise<boolean>}
     */
    async guardarEnFirebase() {
        try {
            const docRef = doc(db, "cuentas_tecnicas_pm", this._id);
            const dataToSave = {
                email: this._email,
                userToken: this._userToken,
                appId: this._appId,
                organizacion: this._organizacion,
                organizacionCamelCase: this._organizacionCamelCase,
                status: this._status,
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp(),
                // ========== NUEVOS CAMPOS ==========
                password: this._password,
                panelPassword: this._panelPassword,
                panelTokens: this._panelTokens
            };
            await setDoc(docRef, dataToSave);
            return true;
        } catch (error) {
            console.error("❌ Error en persistencia Firestore:", error);
            throw error;
        }
    }
    
    /**
     * Actualiza los datos de la cuenta
     * @param {Object} datos - Datos a actualizar
     * @returns {Promise<boolean>}
     */
    async actualizar(datos = {}) {
        try {
            // Actualizar propiedades locales (EXISTENTES)
            if (datos.userToken !== undefined) this._userToken = datos.userToken;
            if (datos.appId !== undefined) this._appId = datos.appId;
            if (datos.organizacion !== undefined) this._organizacion = datos.organizacion;
            if (datos.organizacionCamelCase !== undefined) this._organizacionCamelCase = datos.organizacionCamelCase;
            if (datos.status !== undefined) this._status = datos.status;
            
            // ========== NUEVOS CAMPOS EN ACTUALIZACIÓN ==========
            if (datos.password !== undefined) this._password = datos.password;
            if (datos.panelPassword !== undefined) this._panelPassword = datos.panelPassword;
            if (datos.panelTokens !== undefined) this._panelTokens = datos.panelTokens;
            
            // Actualizar en Firestore
            const docRef = doc(db, "cuentas_tecnicas_pm", this._id);
            const datosActualizar = {
                ...datos,
                fechaActualizacion: serverTimestamp()
            };
            
            await updateDoc(docRef, datosActualizar);
            return true;
        } catch (error) {
            console.error("❌ Error actualizando cuenta:", error);
            throw error;
        }
    }

    /**
     * Cambia el estado de la cuenta
     * @param {string} nuevoStatus - 'activa', 'inactiva', 'pendiente'
     * @returns {Promise<boolean>}
     */
    async cambiarEstado(nuevoStatus) {
        if (!['activa', 'inactiva', 'pendiente'].includes(nuevoStatus)) {
            throw new Error('Estado no válido');
        }
        
        this._status = nuevoStatus;
        return await this.actualizar({ status: nuevoStatus });
    }

    /**
     * Asigna la cuenta a una organización
     * @param {string} organizacion - Nombre de la organización
     * @param {string} organizacionCamelCase - Identificador único
     * @returns {Promise<boolean>}
     */
    async asignarOrganizacion(organizacion, organizacionCamelCase) {
        if (!organizacion || !organizacionCamelCase) {
            throw new Error('Organización e identificador son requeridos');
        }
        
        this._organizacion = organizacion;
        this._organizacionCamelCase = organizacionCamelCase;
        
        return await this.actualizar({ 
            organizacion, 
            organizacionCamelCase 
        });
    }

    /**
     * Elimina la cuenta de Firestore
     * @returns {Promise<boolean>}
     */
    async eliminar() {
        try {
            const docRef = doc(db, "cuentas_tecnicas_pm", this._id);
            await deleteDoc(docRef);
            return true;
        } catch (error) {
            console.error("❌ Error eliminando cuenta:", error);
            throw error;
        }
    }

    // ========== MÉTODOS ESTÁTICOS ==========

    /**
     * Obtiene todas las cuentas Power Manage
     * @returns {Promise<Array<CuentaPM>>}
     */
    static async obtenerTodas() {
        try {
            const cuentasRef = collection(db, "cuentas_tecnicas_pm");
            const q = query(cuentasRef, orderBy("fechaCreacion", "desc"));
            const querySnapshot = await getDocs(q);
            
            const cuentas = [];
            querySnapshot.forEach((doc) => {
                const cuenta = this._fromFirestore(doc);
                if (cuenta) cuentas.push(cuenta);
            });
            
            return cuentas;
        } catch (error) {
            console.error("❌ Error obteniendo cuentas:", error);
            throw error;
        }
    }

    /**
     * Obtiene una cuenta por su ID (email)
     * @param {string} id - Email o ID de la cuenta
     * @returns {Promise<CuentaPM|null>}
     */
    static async obtenerPorId(id) {
        try {
            const docRef = doc(db, "cuentas_tecnicas_pm", id);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) return null;
            
            return this._fromFirestore(docSnap);
        } catch (error) {
            console.error("❌ Error obteniendo cuenta:", error);
            throw error;
        }
    }

    /**
     * Obtiene cuentas por organización
     * @param {string} organizacionCamelCase - Identificador de la organización
     * @returns {Promise<Array<CuentaPM>>}
     */
    static async obtenerPorOrganizacion(organizacionCamelCase) {
        try {
            const cuentasRef = collection(db, "cuentas_tecnicas_pm");
            const q = query(cuentasRef, where("organizacionCamelCase", "==", organizacionCamelCase));
            const querySnapshot = await getDocs(q);
            
            const cuentas = [];
            querySnapshot.forEach((doc) => {
                const cuenta = this._fromFirestore(doc);
                if (cuenta) cuentas.push(cuenta);
            });
            
            return cuentas;
        } catch (error) {
            console.error("❌ Error obteniendo cuentas por organización:", error);
            throw error;
        }
    }

    /**
     * Obtiene cuentas por estado
     * @param {string} status - 'activa', 'inactiva', 'pendiente'
     * @returns {Promise<Array<CuentaPM>>}
     */
    static async obtenerPorEstado(status) {
        try {
            const cuentasRef = collection(db, "cuentas_tecnicas_pm");
            const q = query(cuentasRef, where("status", "==", status));
            const querySnapshot = await getDocs(q);
            
            const cuentas = [];
            querySnapshot.forEach((doc) => {
                const cuenta = this._fromFirestore(doc);
                if (cuenta) cuentas.push(cuenta);
            });
            
            return cuentas;
        } catch (error) {
            console.error("❌ Error obteniendo cuentas por estado:", error);
            throw error;
        }
    }

    /**
     * Obtiene una cuenta de monitoreo por su App ID
     * @param {string} appId - App ID de la cuenta
     * @returns {Promise<CuentaPM|null>} - Instancia de CuentaPM o null si no existe
     */
    static async obtenerPorAppId(appId) {
        try {
            if (!appId) {
                console.log('❌ App ID no proporcionado');
                return null;
            }
            
            console.log(`🔍 Buscando cuenta con App ID: "${appId}"`);
            
            const cuentasRef = collection(db, "cuentas_tecnicas_pm");
            const q = query(cuentasRef, where("appId", "==", appId));
            const querySnapshot = await getDocs(q);
            
            console.log(`📊 Documentos encontrados: ${querySnapshot.size}`);
            
            if (querySnapshot.empty) {
                console.log(`❌ No se encontró ningún documento con appId = "${appId}"`);
                return null;
            }
            
            const docSnap = querySnapshot.docs[0];
            return this._fromFirestore(docSnap);
            
        } catch (error) {
            console.error('❌ Error obteniendo cuenta por App ID:', error);
            return null;
        }
    }

    /**
     * Verifica si existe una cuenta con el email dado
     * @param {string} email - Email a verificar
     * @returns {Promise<boolean>}
     */
    static async existe(email) {
        try {
            const cuenta = await this.obtenerPorId(email);
            return cuenta !== null;
        } catch (error) {
            console.error("❌ Error verificando existencia:", error);
            throw error;
        }
    }

    /**
     * Crea una nueva cuenta
     * @param {string} email - Email de la cuenta
     * @param {Object} datos - Datos iniciales
     * @returns {Promise<CuentaPM>}
     */
    static async crear(email, datos = {}) {
        // Verificar si ya existe
        const existe = await this.existe(email);
        if (existe) {
            throw new Error('Ya existe una cuenta con este email');
        }
        
        const cuenta = new CuentaPM(email, datos);
        await cuenta.guardarEnFirebase();
        return cuenta;
    }

    /**
     * Elimina una cuenta por ID
     * @param {string} id - ID de la cuenta a eliminar
     * @returns {Promise<boolean>}
     */
    static async eliminarPorId(id) {
        try {
            const docRef = doc(db, "cuentas_tecnicas_pm", id);
            await deleteDoc(docRef);
            return true;
        } catch (error) {
            console.error("❌ Error eliminando cuenta:", error);
            throw error;
        }
    }

    // ========== MÉTODOS DE INSTANCIA ADICIONALES ==========

    /**
     * Recarga los datos de la cuenta desde Firestore
     * @returns {Promise<boolean>}
     */
    async recargar() {
        try {
            const cuenta = await CuentaPM.obtenerPorId(this._id);
            if (!cuenta) return false;
            
            // Actualizar todas las propiedades
            this._email = cuenta.email;
            this._userToken = cuenta.userToken;
            this._appId = cuenta.appId;
            this._organizacion = cuenta.organizacion;
            this._organizacionCamelCase = cuenta.organizacionCamelCase;
            this._status = cuenta.status;
            this._fechaCreacion = cuenta.fechaCreacion;
            this._fechaActualizacion = cuenta.fechaActualizacion;
            
            // ========== NUEVOS CAMPOS ==========
            this._password = cuenta.password;
            this._panelPassword = cuenta.panelPassword;
            this._panelTokens = cuenta.panelTokens;
            
            return true;
        } catch (error) {
            console.error("❌ Error recargando cuenta:", error);
            throw error;
        }
    }

    /**
     * Obtiene un objeto plano con los datos de la cuenta
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this._id,
            email: this._email,
            userToken: this._userToken,
            appId: this._appId,
            organizacion: this._organizacion,
            organizacionCamelCase: this._organizacionCamelCase,
            status: this._status,
            fechaCreacion: this._fechaCreacion,
            fechaActualizacion: this._fechaActualizacion,
            // ========== NUEVOS CAMPOS ==========
            password: this._password,
            panelPassword: this._panelPassword,
            panelTokens: this._panelTokens
        };
    }
}

export { CuentaPM };