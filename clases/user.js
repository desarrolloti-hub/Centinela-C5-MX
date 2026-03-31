// user.js - VERSIÓN COMPLETA CON SUCURSALES
// CON REGISTRO DE CONSUMO FIREBASE

import { db, auth } from '/config/firebase-config.js';
import {
    collection,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    query,
    where,
    arrayUnion,
    arrayRemove,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    sendEmailVerification,
    applyActionCode,
    deleteUser
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// Importar la instancia de consumo
import consumo from '/clases/consumoFirebase.js';

class User {
    constructor(id, data) {
        this.id = id;

        this.organizacion = data.organizacion || '';
        this.organizacionCamelCase = data.organizacionCamelCase || '';

        this.nombreCompleto = data.nombreCompleto || '';
        this.correoElectronico = data.correoElectronico || '';
        this.telefono = data.telefono || ''; // Nuevo campo teléfono
        this.status = data.status !== undefined ? data.status : true;
        this.idAuth = data.idAuth || '';
        this.fotoUsuario = data.fotoUsuario || data.fotoURL || data.foto || '';
        this.fotoOrganizacion = data.fotoOrganizacion || data.logoOrganizacion || data.logo || '';

        this.rol = data.rol || 'colaborador';

        this.cargo = data.cargo || null;
        this.areaAsignadaId = data.areaAsignadaId || null;
        this.areaAsignadaNombre = data.areaAsignadaNombre || '';
        this.cargoId = data.cargoId || null;

        // ✅ CAMPOS DE SUCURSAL
        this.sucursalAsignadaId = data.sucursalAsignadaId || null;
        this.sucursalAsignadaNombre = data.sucursalAsignadaNombre || null;
        this.sucursalAsignadaCiudad = data.sucursalAsignadaCiudad || null;

        this.dispositivos = data.dispositivos || [];

        this.fechaActualizacion = data.fechaActualizacion ? this._convertirFecha(data.fechaActualizacion) : new Date();
        this.fechaCreacion = data.fechaCreacion ? this._convertirFecha(data.fechaCreacion) : new Date();
        this.ultimoLogin = data.ultimoLogin ? this._convertirFecha(data.ultimoLogin) : null;

        this.theme = data.theme || this._obtenerThemeDelLocalStorage() || 'predeterminado';

        this.permisosPersonalizados = data.permisosPersonalizados || {};
        this.plan = data.plan || 'gratis';

        this.verificado = data.verificado || false;
        this.emailVerified = data.emailVerified || false;

        this.creadoPor = data.creadoPor || '';
        this.creadoPorEmail = data.creadoPorEmail || '';
        this.creadoPorNombre = data.creadoPorNombre || '';
        this.actualizadoPor = data.actualizadoPor || '';
    }

    _convertirFecha(fecha) {
        if (fecha && typeof fecha.toDate === 'function') return fecha.toDate();
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'string' || typeof fecha === 'number') return new Date(fecha);
        return new Date();
    }

    _obtenerThemeDelLocalStorage() {
        try {
            const savedTheme = localStorage.getItem('centinela-theme');
            if (savedTheme) {
                const themeData = JSON.parse(savedTheme);
                return themeData.themeId || 'default';
            }
        } catch (e) {
        }
        return 'default';
    }

    getFotoUrl() {
        if (!this.fotoUsuario || this.fotoUsuario.trim() === '') {
            return 'https://via.placeholder.com/150/0a2540/ffffff?text=No+Photo';
        }

        if (this.fotoUsuario.startsWith('data:image')) {
            return this.fotoUsuario;
        }

        if (this.fotoUsuario.startsWith('http')) {
            return this.fotoUsuario;
        }

        if (this.fotoUsuario.length > 100 && !this.fotoUsuario.includes('://')) {
            let mimeType = 'image/png';
            if (this.fotoUsuario.startsWith('/9j/') || this.fotoUsuario.startsWith('iVBORw')) {
                mimeType = 'image/jpeg';
            } else if (this.fotoUsuario.startsWith('R0lGOD')) {
                mimeType = 'image/gif';
            }

            return `data:${mimeType};base64,${this.fotoUsuario}`;
        }

        return 'https://via.placeholder.com/150/0a2540/ffffff?text=Invalid+Photo';
    }

    esMaster() {
        return this.rol === 'master';
    }

    esAdministrador() {
        return this.rol === 'administrador';
    }

    esColaborador() {
        return this.rol === 'colaborador';
    }

    tienePermiso(permiso) {
        if (this.esMaster() || this.esAdministrador()) {
            return true;
        }

        if (this.esColaborador()) {
            return this.permisosPersonalizados[permiso] === true;
        }

        return false;
    }

    getTokensActivos() {
        if (!this.dispositivos || !Array.isArray(this.dispositivos)) {
            return [];
        }
        return this.dispositivos
            .filter(d => d.token && d.enabled !== false)
            .map(d => d.token);
    }

    tieneNotificacionesHabilitadas() {
        return this.getTokensActivos().length > 0;
    }

    getDispositivo(deviceId) {
        if (!this.dispositivos) return null;
        return this.dispositivos.find(d => d.deviceId === deviceId) || null;
    }

    estaActivo() {
        return this.status;
    }

    estaVerificado() {
        return this.verificado && this.emailVerified;
    }

    estaInactivo() {
        return !this.status;
    }

    getEstadoTexto() {
        if (!this.status) {
            return 'Inactivo';
        } else {
            return 'Activo';
        }
    }

    getEstadoBadge() {
        if (this.estaActivo()) {
            return `<span style="background: #28a745; color: white; padding: 3px 8px; border-radius: 20px; font-size: 0.8rem;">
                <i class="fas fa-check-circle"></i> Activo
            </span>`;
        } else {
            return `<span style="background: #ffc107; color: black; padding: 3px 8px; border-radius: 20px; font-size: 0.8rem;">
                <i class="fas fa-pause-circle"></i> Inactivo
            </span>`;
        }
    }

    tieneLimiteUsuarios() {
        const limites = {
            'gratis': 100,
            'basico': 200,
            'premium': 300,
            'empresa': 999
        };
        return limites[this.plan] || 100;
    }

    puedeCrearMasUsuarios(totalUsuarios) {
        if (this.plan === 'empresa') return true;
        return totalUsuarios < this.tieneLimiteUsuarios();
    }
}

window.handleUserImageError = function (imgElement, userId) {
    console.error(`❌ Error cargando imagen para usuario ${userId}`);
    imgElement.src = 'https://via.placeholder.com/150/0a2540/ffffff?text=No+Photo';
};

window.handleUserImageLoad = function (imgElement, userId) {
};

class UserManager {
    constructor() {
        this.users = [];
        this.currentUser = null;
        this.historialManager = null;
        this.notificacionManager = null;

        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await this.loadCurrentUser(user.uid);
            } else {
                this.currentUser = null;
            }
        });
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

    async _initNotificacionManager() {
        if (!this.notificacionManager) {
            try {
                const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
                this.notificacionManager = new NotificacionAreaManager();
            } catch (error) {
                console.error('Error inicializando notificacionManager:', error);
            }
        }
        return this.notificacionManager;
    }

    async _obtenerIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (e) {
            return 'desconocida';
        }
    }

    // ========== MÉTODO LOADCURRENTUSER (CON MASTER/SYSADMIN) ==========
    async loadCurrentUser(userId) {
        try {
            // 1. Buscar primero si es MASTER (Administrador del Sistema)
            const masterRef = doc(db, "administradoresSistema", userId);

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradoresSistema", userId);

            const masterSnap = await getDoc(masterRef);

            if (masterSnap.exists()) {
                const data = masterSnap.data();
                const user = new User(userId, {
                    ...data,
                    idAuth: userId,
                    rol: 'master',
                    cargo: data.cargo || null,
                    cargoId: data.cargoId || null,
                    fotoUsuario: data.fotoUsuario || null,
                    organizacion: 'Sistema',
                    organizacionCamelCase: 'sistema',
                    verificado: true,
                    emailVerified: auth.currentUser?.emailVerified || false,
                    telefono: data.telefono || '' // Nuevo campo
                });

                this.currentUser = user;
                this.users.push(user);
                console.log("✅ Usuario Master cargado:", user.correoElectronico);
                return user;
            }

            // 2. Si no es Master, buscar como ADMINISTRADOR (dueño de organización)
            const adminRef = doc(db, "administradores", userId);

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", userId);

            const adminSnap = await getDoc(adminRef);

            if (adminSnap.exists()) {
                const data = adminSnap.data();
                const user = new User(userId, {
                    ...data,
                    idAuth: userId,
                    rol: data.rol || 'administrador',
                    cargo: data.cargo || null,
                    cargoId: data.cargoId || (data.cargo && data.cargo.id) || null,
                    fotoUsuario: data.fotoUsuario || data.fotoURL || data.foto || null,
                    fotoOrganizacion: data.fotoOrganizacion || data.logoOrganizacion || data.logo || null,
                    email: data.correoElectronico || data.email,
                    areaAsignadaId: data.areaAsignadaId,
                    creadoPorEmail: data.creadoPorEmail,
                    creadoPorNombre: data.creadoPorNombre,
                    actualizadoPor: data.actualizadoPor,
                    telefono: data.telefono || '' // Nuevo campo
                });

                this.users.push(user);
                this.currentUser = user;
                return user;
            }

            // 3. Si no es Master ni Admin, buscar como COLABORADOR
            const todasLasOrganizaciones = await this.getTodasLasOrganizaciones();

            for (const organizacion of todasLasOrganizaciones) {
                const coleccionColaboradores = `colaboradores_${organizacion.camelCase}`;

                const colabQuery = query(
                    collection(db, coleccionColaboradores),
                    where("idAuth", "==", userId)
                );

                // [MODIFICACIÓN]: Registrar LECTURA
                await consumo.registrarFirestoreLectura(coleccionColaboradores, `consulta por idAuth: ${userId}`);

                const colabSnapshot = await getDocs(colabQuery);

                if (!colabSnapshot.empty) {
                    const docSnap = colabSnapshot.docs[0];
                    const data = docSnap.data();

                    if (!data.status) {
                        await signOut(auth);
                        throw new Error('Tu cuenta está inactiva. Contacta al administrador de tu organización.');
                    }

                    const user = new User(userId, {
                        ...data,
                        idAuth: userId,
                        rol: data.rol || 'colaborador',
                        cargo: data.cargo || null,
                        cargoId: data.cargoId || (data.cargo && data.cargo.id) || null,
                        fotoUsuario: data.fotoUsuario || data.fotoURL || data.foto || null,
                        fotoOrganizacion: data.fotoOrganizacion || data.logoOrganizacion || data.logo || null,
                        email: data.correoElectronico || data.email,
                        emailVerified: auth.currentUser?.emailVerified || false,
                        areaAsignadaId: data.areaAsignadaId,
                        creadoPorEmail: data.creadoPorEmail,
                        creadoPorNombre: data.creadoPorNombre,
                        actualizadoPor: data.actualizadoPor,
                        telefono: data.telefono || '', // Nuevo campo
                        // ✅ CAMPOS DE SUCURSAL
                        sucursalAsignadaId: data.sucursalAsignadaId || null,
                        sucursalAsignadaNombre: data.sucursalAsignadaNombre || null,
                        sucursalAsignadaCiudad: data.sucursalAsignadaCiudad || null
                    });

                    this.currentUser = user;
                    this.users.push(user);
                    return user;
                }
            }

            return null;

        } catch (error) {
            console.error("❌ Error cargando usuario actual:", error);
            throw error;
        }
    }

    async getTodasLasOrganizaciones() {
        try {
            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", "lista organizaciones");

            const adminsSnapshot = await getDocs(collection(db, "administradores"));
            const organizaciones = [];

            adminsSnapshot.forEach(doc => {
                const data = doc.data();
                organizaciones.push({
                    id: doc.id,
                    nombre: data.organizacion,
                    camelCase: data.organizacionCamelCase,
                    status: data.status || true
                });
            });

            return organizaciones;
        } catch (error) {
            console.error("Error obteniendo organizaciones:", error);
            return [];
        }
    }

    async createAdministrador(adminData, password) {
        try {
            const emailExistsAdmin = await this.verificarCorreoExistente(adminData.correoElectronico, 'administrador');
            if (emailExistsAdmin) {
                throw new Error('El correo electrónico ya está registrado como administrador');
            }

            const userCredential = await createUserWithEmailAndPassword(
                auth,
                adminData.correoElectronico,
                password
            );
            const uid = userCredential.user.uid;

            try {
                await sendEmailVerification(userCredential.user, {
                    url: window.location.origin + '/verifyEmail.html',
                    handleCodeInApp: true
                });
            } catch (emailError) {
                console.warn('⚠️ Error enviando verificación de email:', emailError);
            }

            await updateProfile(userCredential.user, {
                displayName: adminData.nombreCompleto
            });

            const adminRef = doc(db, "administradores", uid);

            const adminFirestoreData = {
                ...adminData,
                idAuth: uid,
                rol: 'administrador',
                cargo: adminData.cargo || null,
                cargoId: adminData.cargoId || (adminData.cargo && adminData.cargo.id) || null,
                plan: adminData.plan || 'gratis',
                verificado: false,
                emailVerified: false,
                status: true,
                dispositivos: [],
                creadoPor: uid,
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp(),
                ultimoLogin: null,
                telefono: adminData.telefono || '' // Nuevo campo
            };

            // [MODIFICACIÓN]: Registrar ESCRITURA
            await consumo.registrarFirestoreEscritura("administradores", uid);

            await setDoc(adminRef, adminFirestoreData);

            const newAdmin = new User(uid, {
                ...adminFirestoreData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date()
            });
            this.users.unshift(newAdmin);

            await signOut(auth);

            return {
                id: uid,
                user: newAdmin,
                credential: userCredential,
                emailVerificationSent: true
            };

        } catch (error) {
            console.error("❌ Error creando administrador:", error);

            if (auth.currentUser) {
                try {
                    await auth.currentUser.delete();
                } catch (deleteError) {
                }
            }

            throw error;
        }
    }

    /**
     * Crea un nuevo Administrador del Sistema (MASTER)
     * @param {Object} masterData - Datos del master { nombreCompleto, correoElectronico, fotoUsuario (opcional), telefono (opcional) }
     * @param {string} password - Contraseña
     * @returns {Promise<Object>} - Resultado de la creación
     */
    async createMaster(masterData, password) {
        try {
            const emailExists = await this.verificarCorreoExistente(masterData.correoElectronico, 'todos');
            if (emailExists) {
                throw new Error('El correo electrónico ya está registrado en el sistema.');
            }

            const userCredential = await createUserWithEmailAndPassword(
                auth,
                masterData.correoElectronico,
                password
            );
            const uid = userCredential.user.uid;

            try {
                await sendEmailVerification(userCredential.user, {
                    url: window.location.origin + '/verifyEmail.html',
                    handleCodeInApp: true
                });
            } catch (emailError) {
                console.warn('⚠️ Error enviando verificación de email al master:', emailError);
            }

            const profileUpdates = {
                displayName: masterData.nombreCompleto
            };

            if (masterData.fotoUsuario && masterData.fotoUsuario.startsWith('data:image')) {
                console.log('📸 Se guardará foto en Firestore');
            }

            await updateProfile(userCredential.user, profileUpdates);

            const masterRef = doc(db, "administradoresSistema", uid);
            const masterFirestoreData = {
                nombreCompleto: masterData.nombreCompleto,
                correoElectronico: masterData.correoElectronico,
                idAuth: uid,
                fotoUsuario: masterData.fotoUsuario || null,
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp(),
                ultimoLogin: null,
                creadoPor: this.currentUser?.id || 'sistema',
                telefono: masterData.telefono || '' // Nuevo campo
            };

            // [MODIFICACIÓN]: Registrar ESCRITURA
            await consumo.registrarFirestoreEscritura("administradoresSistema", uid);

            await setDoc(masterRef, masterFirestoreData);

            const newMaster = new User(uid, {
                ...masterFirestoreData,
                rol: 'master',
                organizacion: 'Sistema',
                organizacionCamelCase: 'sistema',
                fechaCreacion: new Date(),
                fechaActualizacion: new Date(),
                verificado: false,
                emailVerified: false
            });

            this.users.unshift(newMaster);

            await signOut(auth);

            console.log("✅ Administrador del Sistema (Master) creado exitosamente:", uid);
            return {
                id: uid,
                user: newMaster,
                credential: userCredential,
                emailVerificationSent: true
            };

        } catch (error) {
            console.error("❌ Error creando Administrador del Sistema (Master):", error);

            if (auth.currentUser) {
                try {
                    await auth.currentUser.delete();
                } catch (deleteError) {
                    console.warn("No se pudo eliminar el usuario de Auth tras error:", deleteError);
                }
            }
            throw error;
        }
    }

    async createColaborador(colaboradorData, password, idAdministrador) {
        const adminEmail = auth.currentUser?.email;
        const adminPassword = password;

        try {
            const adminRef = doc(db, "administradores", idAdministrador);

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", idAdministrador);

            const adminSnap = await getDoc(adminRef);

            if (!adminSnap.exists()) {
                throw new Error('Administrador no encontrado');
            }

            const adminData = adminSnap.data();

            if (!adminData.status) {
                throw new Error('El administrador está inactivo');
            }

            const totalUsuariosActivos = await this.contarUsuariosActivosPorOrganizacion(adminData.organizacionCamelCase);
            const adminUser = new User(idAdministrador, adminData);

            if (!adminUser.puedeCrearMasUsuarios(totalUsuariosActivos + 1)) {
                throw new Error(`Límite de usuarios alcanzado para el plan ${adminUser.plan}. Máximo: ${adminUser.tieneLimiteUsuarios()} usuarios activos.`);
            }

            const emailExistsOrg = await this.verificarCorreoEnOrganizacion(
                colaboradorData.correoElectronico,
                adminData.organizacionCamelCase
            );
            if (emailExistsOrg) {
                throw new Error('El correo electrónico ya está registrado en esta organización');
            }

            const userCredential = await createUserWithEmailAndPassword(
                auth,
                colaboradorData.correoElectronico,
                password
            );
            const uid = userCredential.user.uid;

            try {
                await sendEmailVerification(userCredential.user, {
                    url: window.location.origin + '/verifyEmail.html',
                    handleCodeInApp: true
                });
            } catch (emailError) {
                console.warn('Error enviando verificación:', emailError);
            }

            await updateProfile(userCredential.user, {
                displayName: colaboradorData.nombreCompleto
            });

            const coleccionColaboradores = `colaboradores_${adminData.organizacionCamelCase}`;

            const colabRef = doc(db, coleccionColaboradores, uid);

            const colabFirestoreData = {
                ...colaboradorData,
                idAuth: uid,
                rol: 'colaborador',
                cargo: colaboradorData.cargo || null,
                cargoId: colaboradorData.cargoId || (colaboradorData.cargo && colaboradorData.cargo.id) || null,
                organizacion: adminData.organizacion,
                organizacionCamelCase: adminData.organizacionCamelCase,
                fotoOrganizacion: adminData.fotoOrganizacion || adminData.logoOrganizacion || null,
                fotoUsuario: colaboradorData.fotoUsuario || colaboradorData.fotoURL || null,
                theme: adminData.theme || 'light',
                plan: adminData.plan || 'gratis',
                verificado: false,
                emailVerified: false,
                permisosPersonalizados: {
                    leerPerfil: true,
                    leerOrganizacion: true,
                    actualizarPerfil: false,
                    crearContenido: false,
                    eliminarContenido: false
                },
                status: true,
                dispositivos: [],
                creadoPor: idAdministrador,
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp(),
                ultimoLogin: null,
                telefono: colaboradorData.telefono || '', // Nuevo campo
                // ✅ CAMPOS DE SUCURSAL
                sucursalAsignadaId: colaboradorData.sucursalAsignadaId || null,
                sucursalAsignadaNombre: colaboradorData.sucursalAsignadaNombre || null,
                sucursalAsignadaCiudad: colaboradorData.sucursalAsignadaCiudad || null
            };

            // [MODIFICACIÓN]: Registrar ESCRITURA
            await consumo.registrarFirestoreEscritura(coleccionColaboradores, uid);

            await setDoc(colabRef, colabFirestoreData);

            const newColab = new User(uid, {
                ...colabFirestoreData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date()
            });
            this.users.unshift(newColab);

            await signOut(auth);

            if (adminEmail && adminPassword) {
                try {
                    const adminCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
                    await this.loadCurrentUser(adminCredential.user.uid);
                } catch (restoreError) {
                    console.warn('⚠️ No se pudo restaurar sesión del administrador:', restoreError.message);
                }
            }

            return {
                id: uid,
                user: newColab,
                credential: userCredential,
                coleccion: coleccionColaboradores,
                emailVerificationSent: true,
                adminSessionRestored: true
            };

        } catch (error) {
            console.error("Error creando colaborador:", error);

            if (auth.currentUser && auth.currentUser.uid !== idAdministrador) {
                try {
                    await deleteUser(auth.currentUser);
                } catch (deleteError) {
                }
            }

            throw error;
        }
    }

    async guardarDispositivo(dispositivoInfo) {
        if (!this.currentUser) {
            throw new Error('No hay usuario autenticado');
        }

        const userId = this.currentUser.id;
        const org = this.currentUser.organizacionCamelCase;
        const isAdmin = this.currentUser.esAdministrador();

        try {
            let userDocRef;
            let coleccion;
            if (isAdmin) {
                coleccion = "administradores";
                userDocRef = doc(db, coleccion, userId);
            } else {
                coleccion = `colaboradores_${org}`;
                userDocRef = doc(db, coleccion, userId);
            }

            const dispositivo = {
                token: dispositivoInfo.token,
                deviceId: dispositivoInfo.deviceId,
                userAgent: dispositivoInfo.userAgent || navigator.userAgent,
                platform: dispositivoInfo.platform || navigator.platform,
                lastUsed: new Date().toISOString(),
                enabled: true
            };

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccion, userId);

            const userSnap = await getDoc(userDocRef);
            if (!userSnap.exists()) {
                throw new Error('Usuario no encontrado en Firestore');
            }

            const userData = userSnap.data();
            let dispositivosActualizados = userData.dispositivos || [];

            dispositivosActualizados = dispositivosActualizados.filter(d =>
                d.deviceId !== dispositivo.deviceId && d.token !== dispositivo.token
            );

            dispositivosActualizados.unshift(dispositivo);

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(coleccion, userId);

            await updateDoc(userDocRef, {
                dispositivos: dispositivosActualizados,
                fechaActualizacion: serverTimestamp()
            });

            if (this.currentUser) {
                this.currentUser.dispositivos = dispositivosActualizados;
            }

            return true;

        } catch (error) {
            console.error('❌ Error guardando dispositivo:', error);
            throw error;
        }
    }

    async deshabilitarDispositivo(deviceId) {
        if (!this.currentUser) {
            throw new Error('No hay usuario autenticado');
        }

        const userId = this.currentUser.id;
        const org = this.currentUser.organizacionCamelCase;
        const isAdmin = this.currentUser.esAdministrador();

        try {
            let userDocRef;
            let coleccion;
            if (isAdmin) {
                coleccion = "administradores";
                userDocRef = doc(db, coleccion, userId);
            } else {
                coleccion = `colaboradores_${org}`;
                userDocRef = doc(db, coleccion, userId);
            }

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccion, userId);

            const userSnap = await getDoc(userDocRef);
            if (!userSnap.exists()) {
                throw new Error('Usuario no encontrado');
            }

            const userData = userSnap.data();
            let dispositivos = userData.dispositivos || [];

            const dispositivosActualizados = dispositivos.map(d =>
                d.deviceId === deviceId ? { ...d, enabled: false, lastUsed: new Date().toISOString() } : d
            );

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(coleccion, userId);

            await updateDoc(userDocRef, {
                dispositivos: dispositivosActualizados,
                fechaActualizacion: serverTimestamp()
            });

            if (this.currentUser) {
                this.currentUser.dispositivos = dispositivosActualizados;
            }

            return true;

        } catch (error) {
            console.error('❌ Error deshabilitando dispositivo:', error);
            throw error;
        }
    }

    async habilitarDispositivo(deviceId) {
        if (!this.currentUser) {
            throw new Error('No hay usuario autenticado');
        }

        const userId = this.currentUser.id;
        const org = this.currentUser.organizacionCamelCase;
        const isAdmin = this.currentUser.esAdministrador();

        try {
            let userDocRef;
            let coleccion;
            if (isAdmin) {
                coleccion = "administradores";
                userDocRef = doc(db, coleccion, userId);
            } else {
                coleccion = `colaboradores_${org}`;
                userDocRef = doc(db, coleccion, userId);
            }

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccion, userId);

            const userSnap = await getDoc(userDocRef);
            if (!userSnap.exists()) {
                throw new Error('Usuario no encontrado');
            }

            const userData = userSnap.data();
            let dispositivos = userData.dispositivos || [];

            const dispositivosActualizados = dispositivos.map(d =>
                d.deviceId === deviceId ? { ...d, enabled: true, lastUsed: new Date().toISOString() } : d
            );

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(coleccion, userId);

            await updateDoc(userDocRef, {
                dispositivos: dispositivosActualizados,
                fechaActualizacion: serverTimestamp()
            });

            if (this.currentUser) {
                this.currentUser.dispositivos = dispositivosActualizados;
            }

            return true;

        } catch (error) {
            console.error('❌ Error habilitando dispositivo:', error);
            throw error;
        }
    }

    async eliminarDispositivo(deviceId) {
        if (!this.currentUser) {
            throw new Error('No hay usuario autenticado');
        }

        const userId = this.currentUser.id;
        const org = this.currentUser.organizacionCamelCase;
        const isAdmin = this.currentUser.esAdministrador();

        try {
            let userDocRef;
            let coleccion;
            if (isAdmin) {
                coleccion = "administradores";
                userDocRef = doc(db, coleccion, userId);
            } else {
                coleccion = `colaboradores_${org}`;
                userDocRef = doc(db, coleccion, userId);
            }

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccion, userId);

            const userSnap = await getDoc(userDocRef);
            if (!userSnap.exists()) {
                throw new Error('Usuario no encontrado');
            }

            const userData = userSnap.data();
            let dispositivos = userData.dispositivos || [];

            const dispositivosActualizados = dispositivos.filter(d => d.deviceId !== deviceId);

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(coleccion, userId);

            await updateDoc(userDocRef, {
                dispositivos: dispositivosActualizados,
                fechaActualizacion: serverTimestamp()
            });

            if (this.currentUser) {
                this.currentUser.dispositivos = dispositivosActualizados;
            }

            return true;

        } catch (error) {
            console.error('❌ Error eliminando dispositivo:', error);
            throw error;
        }
    }

    async reenviarVerificacionEmail() {
        try {
            if (!auth.currentUser) {
                throw new Error('Usuario no autenticado');
            }

            await sendEmailVerification(auth.currentUser, {
                url: window.location.origin + '/verifyEmail.html',
                handleCodeInApp: true
            });

            return {
                success: true,
                message: 'Correo de verificación reenviado'
            };

        } catch (error) {
            console.error('Error reenviando verificación:', error);
            throw error;
        }
    }

    async verificarEmail(actionCode) {
        try {
            await applyActionCode(auth, actionCode);

            if (auth.currentUser) {
                await this.loadCurrentUser(auth.currentUser.uid);

                if (this.currentUser) {
                    if (this.currentUser.esAdministrador()) {
                        // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
                        await consumo.registrarFirestoreActualizacion("administradores", this.currentUser.id);
                        await updateDoc(doc(db, "administradores", this.currentUser.id), {
                            verificado: true,
                            emailVerified: true,
                            fechaActualizacion: serverTimestamp()
                        });
                    } else {
                        const coleccionColaboradores = `colaboradores_${this.currentUser.organizacionCamelCase}`;
                        // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
                        await consumo.registrarFirestoreActualizacion(coleccionColaboradores, this.currentUser.id);
                        await updateDoc(doc(db, coleccionColaboradores, this.currentUser.id), {
                            verificado: true,
                            emailVerified: true,
                            fechaActualizacion: serverTimestamp()
                        });
                    }
                }
            }

            return {
                success: true,
                message: 'Email verificado exitosamente'
            };

        } catch (error) {
            console.error('Error verificando email:', error);
            throw error;
        }
    }

    async enviarCorreoRecuperacion(email) {
        try {

            const actionCodeSettings = {
                url: window.location.origin + '/verifyEmail.html',
                handleCodeInApp: true
            };

            await sendPasswordResetEmail(auth, email, actionCodeSettings);

            return {
                success: true,
                message: 'Correo enviado correctamente. Revisa tu bandeja de entrada y SPAM.'
            };

        } catch (error) {
            console.error('❌ Error enviando correo de recuperación:', error);

            if (error.code === 'auth/user-not-found') {
                return {
                    success: false,
                    message: 'No existe una cuenta con este correo electrónico.',
                    code: 'user-not-found'
                };
            } else if (error.code === 'auth/invalid-email') {
                return {
                    success: false,
                    message: 'El formato del correo no es válido.',
                    code: 'invalid-email'
                };
            } else if (error.code === 'auth/too-many-requests') {
                return {
                    success: false,
                    message: 'Demasiados intentos. Intenta más tarde.',
                    code: 'too-many-requests'
                };
            } else if (error.code === 'auth/network-request-failed') {
                return {
                    success: false,
                    message: 'Error de conexión. Verifica tu internet.',
                    code: 'network-error'
                };
            } else {
                return {
                    success: false,
                    message: 'Error al enviar el correo: ' + (error.message || 'Intenta nuevamente.'),
                    code: 'unknown'
                };
            }
        }
    }

    async inactivarUsuario(id, userType, organizacionCamelCase = null, usuarioActual = null) {
        try {
            let docRef;
            let coleccion;

            if (userType === 'administrador') {
                coleccion = "administradores";
                docRef = doc(db, coleccion, id);

                if (organizacionCamelCase) {
                    const coleccionColaboradores = `colaboradores_${organizacionCamelCase}`;

                    const colabQuery = query(
                        collection(db, coleccionColaboradores),
                        where("status", "==", true)
                    );

                    // [MODIFICACIÓN]: Registrar LECTURA para la consulta de colaboradores
                    await consumo.registrarFirestoreLectura(coleccionColaboradores, "consulta por status true");

                    const colabSnapshot = await getDocs(colabQuery);
                    const updatePromises = [];

                    colabSnapshot.forEach(docSnap => {
                        // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN para cada colaborador
                        updatePromises.push(
                            (async () => {
                                await consumo.registrarFirestoreActualizacion(coleccionColaboradores, docSnap.id);
                                return updateDoc(doc(db, coleccionColaboradores, docSnap.id), {
                                    status: false,
                                    fechaActualizacion: serverTimestamp(),
                                    actualizadoPor: id
                                });
                            })()
                        );
                    });

                    await Promise.all(updatePromises);
                }
            } else {
                if (!organizacionCamelCase && this.currentUser) {
                    organizacionCamelCase = this.currentUser.organizacionCamelCase;
                }

                if (!organizacionCamelCase) {
                    throw new Error('No se especificó la organización del colaborador');
                }

                coleccion = `colaboradores_${organizacionCamelCase}`;
                docRef = doc(db, coleccion, id);
            }

            const usuario = await this.getUserById(id);

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(coleccion, id);

            await updateDoc(docRef, {
                status: false,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: this.currentUser?.id || 'sistema'
            });

            const index = this.users.findIndex(user => user.id === id);
            if (index !== -1) {
                this.users[index].status = false;
                this.users[index].fechaActualizacion = new Date();
            }

            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'usuarios',
                        descripcion: `Inactivó usuario ${usuario ? usuario.nombreCompleto : id} (${userType})`,
                        detalles: {
                            usuarioId: id,
                            nombre: usuario ? usuario.nombreCompleto : 'Desconocido',
                            tipo: userType,
                            accion: 'inactivar'
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error("Error inactivando usuario:", error);
            throw error;
        }
    }

    async reactivarUsuario(id, userType, organizacionCamelCase = null, usuarioActual = null) {
        try {
            let docRef;
            let coleccion;

            if (userType === 'administrador') {
                coleccion = "administradores";
                docRef = doc(db, coleccion, id);
            } else {
                if (!organizacionCamelCase && this.currentUser) {
                    organizacionCamelCase = this.currentUser.organizacionCamelCase;
                }

                if (!organizacionCamelCase) {
                    throw new Error('No se especificó la organización del colaborador');
                }

                coleccion = `colaboradores_${organizacionCamelCase}`;
                docRef = doc(db, coleccion, id);
            }

            const usuario = await this.getUserById(id);

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(coleccion, id);

            await updateDoc(docRef, {
                status: true,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: this.currentUser?.id || 'sistema'
            });

            const index = this.users.findIndex(user => user.id === id);
            if (index !== -1) {
                this.users[index].status = true;
                this.users[index].fechaActualizacion = new Date();
            }

            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'usuarios',
                        descripcion: `Reactivó usuario ${usuario ? usuario.nombreCompleto : id} (${userType})`,
                        detalles: {
                            usuarioId: id,
                            nombre: usuario ? usuario.nombreCompleto : 'Desconocido',
                            tipo: userType,
                            accion: 'reactivar'
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error("Error reactivando usuario:", error);
            throw error;
        }
    }

    async verificarCorreoEnOrganizacion(correo, organizacionCamelCase) {
        try {
            const adminQuery = query(
                collection(db, "administradores"),
                where("correoElectronico", "==", correo),
                where("organizacionCamelCase", "==", organizacionCamelCase)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", `verificar correo ${correo}`);

            const adminSnapshot = await getDocs(adminQuery);

            if (!adminSnapshot.empty) {
                return true;
            }

            const coleccionColaboradores = `colaboradores_${organizacionCamelCase}`;

            const colabQuery = query(
                collection(db, coleccionColaboradores),
                where("correoElectronico", "==", correo)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccionColaboradores, `verificar correo ${correo}`);

            const colabSnapshot = await getDocs(colabQuery);

            return !colabSnapshot.empty;

        } catch (error) {
            console.error("Error verificando correo en organización:", error);
            return false;
        }
    }

    async verificarCorreoExistente(correo, tipo = 'todos') {
        try {
            if (tipo === 'administrador' || tipo === 'todos') {
                const qAdmins = query(
                    collection(db, "administradores"),
                    where("correoElectronico", "==", correo)
                );

                // [MODIFICACIÓN]: Registrar LECTURA
                await consumo.registrarFirestoreLectura("administradores", `verificar correo existente ${correo}`);

                const adminsSnapshot = await getDocs(qAdmins);

                if (!adminsSnapshot.empty) {
                    return true;
                }
            }

            if (tipo === 'colaborador' || tipo === 'todos') {
                const todasLasOrganizaciones = await this.getTodasLasOrganizaciones();

                for (const organizacion of todasLasOrganizaciones) {
                    const coleccionColaboradores = `colaboradores_${organizacion.camelCase}`;
                    const qColaboradores = query(
                        collection(db, coleccionColaboradores),
                        where("correoElectronico", "==", correo)
                    );

                    // [MODIFICACIÓN]: Registrar LECTURA
                    await consumo.registrarFirestoreLectura(coleccionColaboradores, `verificar correo existente ${correo}`);

                    const colaboradoresSnapshot = await getDocs(qColaboradores);

                    if (!colaboradoresSnapshot.empty) {
                        return true;
                    }
                }
            }

            return false;

        } catch (error) {
            console.error("Error verificando correo existente:", error);
            return false;
        }
    }

    async contarUsuariosActivosPorOrganizacion(organizacionCamelCase) {
        try {
            let total = 0;

            const adminQuery = query(
                collection(db, "administradores"),
                where("organizacionCamelCase", "==", organizacionCamelCase),
                where("status", "==", true)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", "contar usuarios activos por organización");

            const adminSnapshot = await getDocs(adminQuery);
            total += adminSnapshot.size;

            const coleccionColaboradores = `colaboradores_${organizacionCamelCase}`;

            const colabQuery = query(
                collection(db, coleccionColaboradores),
                where("status", "==", true)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccionColaboradores, "contar usuarios activos por organización");

            const colabSnapshot = await getDocs(colabQuery);
            total += colabSnapshot.size;

            return total;

        } catch (error) {
            console.error("Error contando usuarios activos por organización:", error);
            return 0;
        }
    }

    async contarTodosUsuariosPorOrganizacion(organizacionCamelCase) {
        try {
            let total = 0;

            const adminQuery = query(
                collection(db, "administradores"),
                where("organizacionCamelCase", "==", organizacionCamelCase)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", "contar todos usuarios por organización");

            const adminSnapshot = await getDocs(adminQuery);
            total += adminSnapshot.size;

            const coleccionColaboradores = `colaboradores_${organizacionCamelCase}`;

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccionColaboradores, "contar todos usuarios por organización");

            const colabSnapshot = await getDocs(collection(db, coleccionColaboradores));
            total += colabSnapshot.size;

            return total;

        } catch (error) {
            console.error("Error contando todos los usuarios por organización:", error);
            return 0;
        }
    }

    async updateUser(id, data, userType, organizacionCamelCase = null, usuarioActual = null) {
        try {
            let docRef;
            let coleccion;

            if (userType === 'administrador') {
                coleccion = "administradores";
                docRef = doc(db, coleccion, id);
            } else {
                const coleccionNombre = organizacionCamelCase || data.organizacionCamelCase || this.currentUser?.organizacionCamelCase;
                if (!coleccionNombre) {
                    throw new Error('No se especificó la organización del colaborador');
                }

                coleccion = `colaboradores_${coleccionNombre}`;
                docRef = doc(db, coleccion, id);
            }

            const usuarioAntes = await this.getUserById(id);

            const updateData = {
                ...data,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: this.currentUser?.id || 'sistema'
            };

            // ✅ ASEGURAR QUE LOS CAMPOS DE SUCURSAL SE GUARDEN
            if (data.sucursalAsignadaId !== undefined) {
                updateData.sucursalAsignadaId = data.sucursalAsignadaId;
            }
            if (data.sucursalAsignadaNombre !== undefined) {
                updateData.sucursalAsignadaNombre = data.sucursalAsignadaNombre;
            }
            if (data.sucursalAsignadaCiudad !== undefined) {
                updateData.sucursalAsignadaCiudad = data.sucursalAsignadaCiudad;
            }

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(coleccion, id);

            await updateDoc(docRef, updateData);

            const index = this.users.findIndex(user => user.id === id);
            if (index !== -1) {
                Object.keys(data).forEach(key => {
                    this.users[index][key] = data[key];
                });
                this.users[index].fechaActualizacion = new Date();
                this.users[index].actualizadoPor = this.currentUser?.id || 'sistema';
            }

            if (usuarioActual) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    const cambios = [];
                    if (data.nombreCompleto && data.nombreCompleto !== usuarioAntes?.nombreCompleto) {
                        cambios.push(`nombre: "${usuarioAntes?.nombreCompleto}" → "${data.nombreCompleto}"`);
                    }
                    if (data.rol && data.rol !== usuarioAntes?.rol) {
                        cambios.push(`rol: ${usuarioAntes?.rol} → ${data.rol}`);
                    }
                    if (data.telefono && data.telefono !== usuarioAntes?.telefono) {
                        cambios.push(`teléfono: "${usuarioAntes?.telefono || 'No registrado'}" → "${data.telefono}"`);
                    }
                    if (data.sucursalAsignadaNombre !== undefined && data.sucursalAsignadaNombre !== usuarioAntes?.sucursalAsignadaNombre) {
                        cambios.push(`sucursal: "${usuarioAntes?.sucursalAsignadaNombre || 'No asignada'}" → "${data.sucursalAsignadaNombre || 'No asignada'}"`);
                    }

                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'usuarios',
                        descripcion: `Actualizó datos de usuario ${usuarioAntes?.nombreCompleto || id} (${userType})`,
                        detalles: {
                            usuarioId: id,
                            nombre: usuarioAntes?.nombreCompleto || 'Desconocido',
                            tipo: userType,
                            cambios,
                            datosActualizados: data
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error("Error actualizando usuario:", error);
            throw error;
        }
    }

    // ========== MÉTODO INICIARSESION ==========
    async iniciarSesion(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;

            const user = await this.getUserById(uid);

            if (!user) {
                await signOut(auth);
                throw new Error('Usuario no encontrado en la base de datos');
            }

            if (!user.status) {
                await signOut(auth);
                throw new Error('Tu cuenta está inactiva. Contacta al administrador.');
            }

            if (!userCredential.user.emailVerified) {
                console.warn('Usuario no verificado intentando iniciar sesión');

                try {
                    await sendEmailVerification(userCredential.user, {
                        url: window.location.origin + '/verifyEmail.html',
                        handleCodeInApp: true
                    });
                } catch (emailError) {
                    console.warn('Error reenviando verificación:', emailError);
                }

                throw new Error('Tu email no está verificado. Se ha reenviado el correo de verificación.');
            }
            // Actualizar último login según el tipo de usuario
            if (user.esMaster()) {
                // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
                await consumo.registrarFirestoreActualizacion("administradoresSistema", uid);
                await updateDoc(doc(db, "administradoresSistema", uid), {
                    ultimoLogin: serverTimestamp(),
                    fechaActualizacion: serverTimestamp()
                });
            } else if (user.esAdministrador()) {
                // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
                await consumo.registrarFirestoreActualizacion("administradores", uid);
                await updateDoc(doc(db, "administradores", uid), {
                    ultimoLogin: serverTimestamp(),
                    fechaActualizacion: serverTimestamp(),
                    emailVerified: userCredential.user.emailVerified,
                    verificado: true
                });
            } else {
                const coleccionColaboradores = `colaboradores_${user.organizacionCamelCase}`;
                // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
                await consumo.registrarFirestoreActualizacion(coleccionColaboradores, uid);
                await updateDoc(doc(db, coleccionColaboradores, uid), {
                    ultimoLogin: serverTimestamp(),
                    fechaActualizacion: serverTimestamp(),
                    emailVerified: userCredential.user.emailVerified,
                    verificado: true
                });
            }

            await this.loadCurrentUser(uid);

            // Registro en historial
            const historial = await this._initHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: this.currentUser,
                    tipo: 'login',
                    modulo: 'login',
                    descripcion: 'Inició sesión en el sistema',
                    detalles: {
                        metodo: 'email/password',
                        desde: 'web',
                        ip: await this._obtenerIP()
                    }
                });
            }

            try {
                localStorage.setItem('theme', user.theme);
                localStorage.setItem('user-plan', user.plan);
                localStorage.setItem('user-rol', user.rol);
                localStorage.setItem('user-verified', user.verificado.toString());
                if (!user.esMaster()) {
                    localStorage.setItem('organizacion', user.organizacion);
                }
                ///user
                await this.guardarDatosAccesoEnLocalStorage();
            } catch (e) {
                console.warn('No se pudo guardar datos en localStorage');
            }

            return this.currentUser;

        } catch (error) {
            console.error("Error iniciando sesión:", error);
            throw error;
        }
    }

    async getColaboradoresByOrganizacion(organizacionCamelCase, incluirInactivos = false) {
        try {
            const coleccionColaboradores = `colaboradores_${organizacionCamelCase}`;
            let colabQuery;

            if (incluirInactivos) {
                colabQuery = query(
                    collection(db, coleccionColaboradores),
                    orderBy("fechaCreacion", "desc")
                );
            } else {
                colabQuery = query(
                    collection(db, coleccionColaboradores),
                    where("status", "==", true),
                    orderBy("fechaCreacion", "desc")
                );
            }

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccionColaboradores, "lista colaboradores");

            const colabSnapshot = await getDocs(colabQuery);
            const colaboradores = [];

            colabSnapshot.forEach(doc => {
                const data = doc.data();
                colaboradores.push(new User(doc.id, {
                    ...data,
                    cargo: 'colaborador',
                    // ✅ CAMPOS DE SUCURSAL
                    sucursalAsignadaId: data.sucursalAsignadaId || null,
                    sucursalAsignadaNombre: data.sucursalAsignadaNombre || null,
                    sucursalAsignadaCiudad: data.sucursalAsignadaCiudad || null
                }));
            });

            return colaboradores;

        } catch (error) {
            console.error("Error obteniendo colaboradores:", error);
            return [];
        }
    }

    /**
     * Obtener colaboradores por área asignada
     */
    async getColaboradoresPorArea(areaId, organizacionCamelCase, soloActivos = true) {
        try {
            if (!areaId || !organizacionCamelCase) return [];

            const coleccionColaboradores = `colaboradores_${organizacionCamelCase}`;

            let q;
            if (soloActivos) {
                q = query(
                    collection(db, coleccionColaboradores),
                    where("areaAsignadaId", "==", areaId),
                    where("status", "==", true),
                    orderBy("fechaCreacion", "desc")
                );
            } else {
                q = query(
                    collection(db, coleccionColaboradores),
                    where("areaAsignadaId", "==", areaId),
                    orderBy("fechaCreacion", "desc")
                );
            }

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccionColaboradores, `colaboradores por área ${areaId}`);

            const snapshot = await getDocs(q);
            const colaboradores = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                colaboradores.push(new User(doc.id, {
                    ...data,
                    cargo: 'colaborador',
                    // ✅ CAMPOS DE SUCURSAL
                    sucursalAsignadaId: data.sucursalAsignadaId || null,
                    sucursalAsignadaNombre: data.sucursalAsignadaNombre || null,
                    sucursalAsignadaCiudad: data.sucursalAsignadaCiudad || null
                }));
            });

            return colaboradores;

        } catch (error) {
            console.error("Error obteniendo colaboradores por área:", error);
            return [];
        }
    }

    async getAdministradores(incluirInactivos = false) {
        try {
            let adminsQuery;

            if (incluirInactivos) {
                adminsQuery = query(collection(db, "administradores"));
            } else {
                adminsQuery = query(
                    collection(db, "administradores"),
                    where("status", "==", true)
                );
            }

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", "lista administradores");

            const adminsSnapshot = await getDocs(adminsQuery);
            const administradores = [];

            adminsSnapshot.forEach(doc => {
                const data = doc.data();
                administradores.push(new User(doc.id, {
                    ...data,
                    cargo: 'administrador'
                }));
            });

            return administradores;

        } catch (error) {
            console.error("Error obteniendo administradores:", error);
            return [];
        }
    }

    /**
     * Obtiene la lista de Administradores del Sistema (MASTERS)
     * @returns {Promise<Array<User>>} - Lista de usuarios masters
     */
    async getMasters() {
        try {
            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradoresSistema", "lista masters");

            const mastersSnapshot = await getDocs(collection(db, "administradoresSistema"));
            const masters = [];

            mastersSnapshot.forEach(doc => {
                const data = doc.data();
                masters.push(new User(doc.id, {
                    ...data,
                    rol: 'master',
                    organizacion: 'Sistema',
                    organizacionCamelCase: 'sistema',
                    cargo: data.cargo || null,
                    fotoUsuario: data.fotoUsuario || null,
                }));
            });

            return masters;

        } catch (error) {
            console.error("Error obteniendo administradores del sistema (masters):", error);
            return [];
        }
    }

    async getUsuariosInactivosPorOrganizacion(organizacionCamelCase) {
        try {
            const usuariosInactivos = [];

            const adminQuery = query(
                collection(db, "administradores"),
                where("organizacionCamelCase", "==", organizacionCamelCase),
                where("status", "==", false)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", "usuarios inactivos por organización");

            const adminSnapshot = await getDocs(adminQuery);

            adminSnapshot.forEach(doc => {
                const data = doc.data();
                usuariosInactivos.push(new User(doc.id, {
                    ...data,
                    cargo: 'administrador'
                }));
            });

            const coleccionColaboradores = `colaboradores_${organizacionCamelCase}`;

            const colabQuery = query(
                collection(db, coleccionColaboradores),
                where("status", "==", false)
            );

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(coleccionColaboradores, "usuarios inactivos por organización");

            const colabSnapshot = await getDocs(colabQuery);

            colabSnapshot.forEach(doc => {
                const data = doc.data();
                usuariosInactivos.push(new User(doc.id, {
                    ...data,
                    cargo: 'colaborador',
                    // ✅ CAMPOS DE SUCURSAL
                    sucursalAsignadaId: data.sucursalAsignadaId || null,
                    sucursalAsignadaNombre: data.sucursalAsignadaNombre || null,
                    sucursalAsignadaCiudad: data.sucursalAsignadaCiudad || null
                }));
            });

            return usuariosInactivos;

        } catch (error) {
            console.error("Error obteniendo usuarios inactivos:", error);
            return [];
        }
    }

    // ========== MÉTODO GETUSERBYID (ACTUALIZADO CON MASTER Y SUCURSAL) ==========
    async getUserById(id) {
        const userInMemory = this.users.find(user => user.id === id);
        if (userInMemory) {
            return userInMemory;
        }

        try {
            // 1. Buscar primero en MASTERS (Administradores del Sistema)
            const masterRef = doc(db, "administradoresSistema", id);

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradoresSistema", id);

            const masterSnap = await getDoc(masterRef);

            if (masterSnap.exists()) {
                const data = masterSnap.data();
                const user = new User(id, {
                    ...data,
                    idAuth: id,
                    rol: 'master',
                    organizacion: 'Sistema',
                    organizacionCamelCase: 'sistema',
                    cargo: data.cargo || null,
                    fotoUsuario: data.fotoUsuario || null,
                    email: data.correoElectronico || data.email,
                    verificado: true,
                    emailVerified: auth.currentUser?.emailVerified || false,
                    status: true,
                    telefono: data.telefono || '' // Nuevo campo
                });

                this.users.push(user);
                console.log('✅ Master encontrado:', user.correoElectronico);
                return user;
            }

            // 2. Si no es Master, buscar en ADMINISTRADORES
            const adminRef = doc(db, "administradores", id);

            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura("administradores", id);

            const adminSnap = await getDoc(adminRef);

            if (adminSnap.exists()) {
                const data = adminSnap.data();

                const user = new User(id, {
                    ...data,
                    idAuth: id,
                    rol: data.rol || 'administrador',
                    cargo: data.cargo || null,
                    cargoId: data.cargoId || (data.cargo && data.cargo.id) || null,
                    fotoUsuario: data.fotoUsuario || data.fotoURL || data.foto || null,
                    fotoOrganizacion: data.fotoOrganizacion || data.logoOrganizacion || data.logo || null,
                    email: data.correoElectronico || data.email,
                    areaAsignadaId: data.areaAsignadaId,
                    creadoPorEmail: data.creadoPorEmail,
                    creadoPorNombre: data.creadoPorNombre,
                    actualizadoPor: data.actualizadoPor,
                    telefono: data.telefono || '' // Nuevo campo
                });

                this.users.push(user);
                return user;
            }

            // 3. Si no es Master ni Admin, buscar en COLABORADORES
            const organizaciones = await this.getTodasLasOrganizaciones();

            for (const org of organizaciones) {
                const coleccion = `colaboradores_${org.camelCase}`;

                try {
                    const q = query(
                        collection(db, coleccion),
                        where("idAuth", "==", id)
                    );

                    // [MODIFICACIÓN]: Registrar LECTURA
                    await consumo.registrarFirestoreLectura(coleccion, `consulta por idAuth: ${id}`);

                    const snapshot = await getDocs(q);

                    if (!snapshot.empty) {
                        const docSnap = snapshot.docs[0];
                        const data = docSnap.data();

                        const user = new User(id, {
                            ...data,
                            idAuth: id,
                            rol: data.rol || 'colaborador',
                            cargo: data.cargo || null,
                            cargoId: data.cargoId || (data.cargo && data.cargo.id) || null,
                            fotoUsuario: data.fotoUsuario || data.fotoURL || data.foto || null,
                            fotoOrganizacion: data.fotoOrganizacion || data.logoOrganizacion || data.logo || null,
                            email: data.correoElectronico || data.email,
                            areaAsignadaId: data.areaAsignadaId,
                            creadoPorEmail: data.creadoPorEmail,
                            creadoPorNombre: data.creadoPorNombre,
                            actualizadoPor: data.actualizadoPor,
                            telefono: data.telefono || '', // Nuevo campo
                            // ✅ CAMPOS DE SUCURSAL
                            sucursalAsignadaId: data.sucursalAsignadaId || null,
                            sucursalAsignadaNombre: data.sucursalAsignadaNombre || null,
                            sucursalAsignadaCiudad: data.sucursalAsignadaCiudad || null
                        });

                        this.users.push(user);
                        return user;
                    }
                } catch (e) {
                    console.warn(`Colección ${coleccion} no disponible:`, e.message);
                    continue;
                }
            }

            return null;

        } catch (error) {
            console.error('❌ Error en getUserById:', error);
            return null;
        }
    }

    esAdministrador() {
        return this.currentUser && this.currentUser.esAdministrador();
    }

    tienePermiso(permiso) {
        return this.currentUser && this.currentUser.tienePermiso(permiso);
    }

    async logout() {
        try {
            if (this.currentUser) {
                const historial = await this._initHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: this.currentUser,
                        tipo: 'logout',
                        modulo: 'login',
                        descripcion: 'Cerró sesión en el sistema',
                        detalles: {
                            desde: 'web'
                        }
                    });
                }
            }

            await signOut(auth);
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            throw error;
        }
    }

    /**
     * Guarda los datos de plan y permisos en localStorage después del login
     * Debe llamarse después de cargar el usuario actual
     */
    async guardarDatosAccesoEnLocalStorage() {
        if (!this.currentUser) return;

        const usuario = this.currentUser;

        // Guardar datos básicos
        localStorage.setItem('user-rol', usuario.rol);
        localStorage.setItem('user-id', usuario.id);
        localStorage.setItem('user-plan-nombre', usuario.plan || 'gratis');

        if (usuario.esMaster()) {
            localStorage.setItem('plan-usuario', JSON.stringify({
                id: 'master',
                nombre: 'Master',
                mapasActivos: {}
            }));
        }
        else if (usuario.esAdministrador()) {
            try {
                // Intentar cargar el plan completo desde Firestore
                const { GestorPlanesPersonalizados } = await import('/clases/plan.js');
                const gestorPlanes = new GestorPlanesPersonalizados();
                const plan = await gestorPlanes.obtenerPorId(usuario.plan || 'gratis');
                if (plan) {
                    const planInfo = plan.paraInterfaz();
                    localStorage.setItem('plan-usuario', JSON.stringify(planInfo));
                } else {
                    localStorage.setItem('plan-usuario', JSON.stringify({
                        id: usuario.plan || 'gratis',
                        nombre: usuario.plan || 'gratis',
                        mapasActivos: {}
                    }));
                }
            } catch (error) {
                console.warn('No se pudo cargar el plan completo:', error);
                localStorage.setItem('plan-usuario', JSON.stringify({
                    id: usuario.plan || 'gratis',
                    nombre: usuario.plan || 'gratis',
                    mapasActivos: {}
                }));
            }
        }
        else if (usuario.esColaborador()) {
            // Guardar permisos personalizados
            if (usuario.permisosPersonalizados && Object.keys(usuario.permisosPersonalizados).length > 0) {
                localStorage.setItem('permisos-usuario', JSON.stringify(usuario.permisosPersonalizados));
            }

            // Guardar plan del colaborador
            try {
                const { GestorPlanesPersonalizados } = await import('/clases/plan.js');
                const gestorPlanes = new GestorPlanesPersonalizados();
                const plan = await gestorPlanes.obtenerPorId(usuario.plan || 'gratis');
                if (plan) {
                    const planInfo = plan.paraInterfaz();
                    localStorage.setItem('plan-usuario', JSON.stringify(planInfo));
                }
            } catch (error) {
                console.warn('No se pudo cargar el plan del colaborador:', error);
            }
        }

        console.log('✅ Datos de acceso guardados en localStorage');
    }
}

export { User, UserManager };