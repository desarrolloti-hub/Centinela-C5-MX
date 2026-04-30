// frasesAutoCompletar.js - VERSIÓN CON COLECCIÓN POR ORGANIZACIÓN

import { db } from '/config/firebase-config.js';
import { 
    collection, doc, getDocs, getDoc, setDoc, updateDoc, 
    query, where, orderBy, limit, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import consumo from '/clases/consumoFirebase.js';

class FrasesAutoCompletarManager {
    constructor(organizacionCamelCase = null) {
        // Guardar la organización para usarla en todas las operaciones
        this.organizacionCamelCase = organizacionCamelCase;
        // El nombre de la colección ahora incluye la organización
        this.coleccion = organizacionCamelCase 
            ? `frasesAutoCompletar_${organizacionCamelCase}`
            : 'frasesAutoCompletar';  // fallback por si no hay org
       
    }

    /**
     * Guarda o actualiza una frase en la colección de la organización.
     */
    async guardarFrase(texto, categoriaId, subcategoriaId, organizacion, usuarioActual = null) {
        // Validar que organización coincida con la del manager
        if (organizacion !== this.organizacionCamelCase) {
            console.warn(`⚠️ Organización recibida (${organizacion}) no coincide con la del manager (${this.organizacionCamelCase})`);
        }

        if (!texto || !categoriaId || !organizacion) {
            console.error('❌ Faltan datos:', { texto, categoriaId, organizacion });
            throw new Error('Faltan datos obligatorios');
        }

        try {
            const coleccionRef = collection(db, this.coleccion);
            
            // Buscar si ya existe (misma organización implícita por la colección)
            const q = query(
                coleccionRef,
                where('texto', '==', texto),
                where('categoriaId', '==', categoriaId),
                where('subcategoriaId', '==', subcategoriaId || ''),
                // ya no necesitas where('organizacion') porque la colección ya es específica
                limit(1)
            );
            
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                const docRef = snapshot.docs[0].ref;
                const data = snapshot.docs[0].data();
                const nuevasVeces = (data.vecesUsada || 0) + 1;
                await updateDoc(docRef, {
                    vecesUsada: nuevasVeces,
                    fechaUltimaUso: serverTimestamp()
                });
          
                await consumo.registrarFirestoreActualizacion(this.coleccion, docRef.id);
                return { exito: true, id: docRef.id, veces: nuevasVeces };
            } 
            else {
                const nuevoDocRef = doc(coleccionRef);
                const nuevoDocumento = {
                    texto,
                    categoriaId,
                    subcategoriaId: subcategoriaId || '',
                    // ya no guardamos 'organizacion' porque la colección ya la representa
                    vecesUsada: 1,
                    activa: true,
                    fechaCreacion: serverTimestamp(),
                    fechaUltimaUso: serverTimestamp()
                };
                await setDoc(nuevoDocRef, nuevoDocumento);
                await consumo.registrarFirestoreEscritura(this.coleccion, nuevoDocRef.id);
                return { exito: true, id: nuevoDocRef.id, veces: 1 };
            }
        } 
        catch (error) {
            console.error('❌ Error CRÍTICO al guardar frase:', error);
            throw error;
        }
    }

    /**
     * Obtiene frases sugeridas (solo con vecesUsada >= 3)
     */
    async obtenerFrasesSugeridas(organizacion, categoriaId = '', subcategoriaId = '', limite = 50) {
        // Verificar que la organización coincida con la del manager
        if (organizacion !== this.organizacionCamelCase) {
            console.warn(`⚠️ Organización recibida (${organizacion}) no coincide con manager (${this.organizacionCamelCase})`);
        }

        if (!this.organizacionCamelCase) return [];

        try {
            // Ya no necesitas filtrar por 'organizacion' porque la colección es específica
            let constraints = [
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
            }
        } catch (error) {
            console.error('❌ Error incrementando uso:', error);
        }
    }

    /**
     * Método de prueba: crea una frase de ejemplo si la colección está vacía
     */
    async crearFraseEjemploSiVacia(organizacion) {
        if (!organizacion || organizacion !== this.organizacionCamelCase) return;
        const existentes = await this.obtenerFrasesSugeridas(organizacion, '', '', 1);
        if (existentes.length === 0) {
            await this.guardarFrase(
                "Ejemplo: El sistema se reinició inesperadamente durante la noche",
                "categoria_ejemplo",
                "",
                organizacion,
                null
            );
        }
    }
}

export { FrasesAutoCompletarManager };