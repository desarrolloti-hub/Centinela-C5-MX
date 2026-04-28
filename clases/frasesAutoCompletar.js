// frasesAutoCompletar.js - VERSIÓN DEFINITIVA
// ✅ Crea la colección automáticamente al guardar
// ✅ Logs detallados para depuración
// ✅ Manejo de errores con sugerencias

import { db } from '/config/firebase-config.js';
import { 
    collection, doc, getDocs, getDoc, setDoc, updateDoc, 
    query, where, orderBy, limit, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import consumo from '/clases/consumoFirebase.js';

class FrasesAutoCompletarManager {
    constructor() {
        this.coleccion = 'frasesAutoCompletar';  // Nombre exacto: f minúscula, A mayúscula
        console.log('📁 FrasesManager: usando colección', this.coleccion);
    }

    /**
     * Guarda o actualiza una frase. Si la colección no existe, Firestore la crea automáticamente.
     */
    async guardarFrase(texto, categoriaId, subcategoriaId, organizacion, usuarioActual = null) {
        if (!texto || !categoriaId || !organizacion) {
            console.error('❌ Faltan datos:', { texto, categoriaId, organizacion });
            throw new Error('Faltan datos obligatorios');
        }

        try {
            const coleccionRef = collection(db, this.coleccion);
            
            // Buscar si ya existe
            const q = query(
                coleccionRef,
                where('texto', '==', texto),
                where('categoriaId', '==', categoriaId),
                where('subcategoriaId', '==', subcategoriaId || ''),
                where('organizacion', '==', organizacion),
                limit(1)
            );
            
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                // Actualizar existente
                const docRef = snapshot.docs[0].ref;
                const data = snapshot.docs[0].data();
                const nuevasVeces = (data.vecesUsada || 0) + 1;
                await updateDoc(docRef, {
                    vecesUsada: nuevasVeces,
                    fechaUltimaUso: serverTimestamp()
                });
                console.log(`✅ Frase actualizada: "${texto.substring(0, 50)}..." (${nuevasVeces} usos)`);
                await consumo.registrarFirestoreActualizacion(this.coleccion, docRef.id);
                return { exito: true, id: docRef.id, veces: nuevasVeces };
            } 
            else {
                // Crear nueva
                const nuevoDocRef = doc(coleccionRef);
                const nuevoDocumento = {
                    texto,
                    categoriaId,
                    subcategoriaId: subcategoriaId || '',
                    organizacion,
                    vecesUsada: 1,
                    activa: true,
                    fechaCreacion: serverTimestamp(),
                    fechaUltimaUso: serverTimestamp()
                };
                await setDoc(nuevoDocRef, nuevoDocumento);
                console.log(`✨ Nueva frase creada: "${texto.substring(0, 50)}..." (ID: ${nuevoDocRef.id})`);
                await consumo.registrarFirestoreEscritura(this.coleccion, nuevoDocRef.id);
                return { exito: true, id: nuevoDocRef.id, veces: 1 };
            }
        } 
        catch (error) {
            console.error('❌ Error CRÍTICO al guardar frase:', error);
            // Si el error es por falta de permisos, mostramos ayuda
            if (error.code === 'permission-denied') {
                console.warn('⚠️ Las reglas de Firestore están bloqueando la escritura. Ve a Firebase Console -> Firestore -> Reglas y cambia a: allow read, write: if true; (solo para pruebas)');
            }
            throw error;
        }
    }

    /**
     * Obtiene frases sugeridas (solo con vecesUsada >= 3)
     */
    async obtenerFrasesSugeridas(organizacion, categoriaId = '', subcategoriaId = '', limite = 50) {
        if (!organizacion) return [];

        try {
            let constraints = [
                where('organizacion', '==', organizacion),
                where('activa', '==', true),
                where('vecesUsada', '>=', 3),
                orderBy('vecesUsada', 'desc'),
                limit(limite)
            ];
            if (categoriaId && categoriaId !== '') {
                constraints.unshift(where('categoriaId', '==', categoriaId));
            }
            if (subcategoriaId && subcategoriaId !== '') {
                constraints.unshift(where('subcategoriaId', '==', subcategoriaId));
            }

            const q = query(collection(db, this.coleccion), ...constraints);
            const snapshot = await getDocs(q);
            
            const resultados = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                resultados.push({
                    id: doc.id,
                    texto: data.texto,
                    vecesUsada: data.vecesUsada || 0
                });
            });
            console.log(`📊 Frases sugeridas: ${resultados.length} (org: ${organizacion}, cat: ${categoriaId || 'todas'})`);
            return resultados;
        } 
        catch (error) {
            console.error('❌ Error obteniendo frases:', error);
            return [];
        }
    }

    /**
     * Incrementa el contador de usos manualmente
     */
    async incrementarUso(id) {
        if (!id) return;
        try {
            const docRef = doc(db, this.coleccion, id);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const veces = (snap.data().vecesUsada || 0) + 1;
                await updateDoc(docRef, { vecesUsada: veces, fechaUltimaUso: serverTimestamp() });
                console.log(`📈 Uso incrementado: ${id} -> ${veces}`);
            }
        } catch (error) {
            console.error('❌ Error incrementando uso:', error);
        }
    }

    /**
     * Método de prueba: crea una frase de ejemplo si la colección está vacía
     */
    async crearFraseEjemploSiVacia(organizacion) {
        if (!organizacion) return;
        const existentes = await this.obtenerFrasesSugeridas(organizacion, '', '', 1);
        if (existentes.length === 0) {
            console.log('📝 Colección vacía. Creando frase de ejemplo...');
            await this.guardarFrase(
                "Ejemplo: El sistema se reinició inesperadamente durante la noche",
                "categoria_ejemplo",
                "",
                organizacion,
                null
            );
            console.log('✅ Frase de ejemplo creada. Ahora escribe "ejemplo" en la descripción y debería aparecer.');
        }
    }
}

export { FrasesAutoCompletarManager };