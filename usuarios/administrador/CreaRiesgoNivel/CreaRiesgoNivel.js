// CrearRiesgoNivel.js - CON SWAL DE ÉXITO Y ERROR MEJORADOS
import { RiesgoNivelManager } from '/clases/riesgoNivel.js';

let manager = null;
let usuarioActual = null;
let nivelId = null; // si viene en URL, es edición

function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const data = JSON.parse(adminInfo);
            return {
                id: data.id || data.uid,
                nombreCompleto: data.nombreCompleto || 'Administrador',
                organizacion: data.organizacion,
                organizacionCamelCase: data.organizacionCamelCase,
                codigoColaborador: data.codigoColaborador || ''
            };
        }
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        return {
            id: userData.uid || userData.id,
            nombreCompleto: userData.nombreCompleto || 'Usuario',
            organizacion: userData.organizacion,
            organizacionCamelCase: userData.organizacionCamelCase,
            codigoColaborador: userData.codigoColaborador || ''
        };
    } catch { return null; }
}

function obtenerIdDeURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

async function cargarDatosParaEdicion() {
    if (!nivelId) return;
    try {
        const nivel = await manager.obtenerNivelPorId(nivelId, usuarioActual.organizacionCamelCase);
        if (nivel) {
            document.getElementById('nombre').value = nivel.nombre;
            document.getElementById('color').value = nivel.color;
            // actualizar preview
            const preview = document.getElementById('colorPreview');
            if (preview) preview.style.backgroundColor = nivel.color;
        } else {
            await Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se encontró el nivel de riesgo',
                confirmButtonColor: '#dc3545'
            });
            window.location.href = '/usuarios/administrador/riesgoNivel/riesgoNivel.html';
        }
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message,
            confirmButtonColor: '#dc3545'
        });
    }
}

async function guardarNivel(event) {
    event.preventDefault();
    const nombre = document.getElementById('nombre').value.trim();
    const color = document.getElementById('color').value;

    if (!nombre) {
        await Swal.fire({
            icon: 'warning',
            title: 'Campo requerido',
            text: 'El nombre del nivel es obligatorio',
            confirmButtonColor: '#ffc107'
        });
        return;
    }
    if (!color) {
        await Swal.fire({
            icon: 'warning',
            title: 'Campo requerido',
            text: 'Debe seleccionar un color representativo',
            confirmButtonColor: '#ffc107'
        });
        return;
    }

    const btn = document.getElementById('btnGuardar');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        if (nivelId) {
            // Edición
            await manager.actualizarNivel(nivelId, { nombre, color }, usuarioActual, usuarioActual.organizacionCamelCase);
            await Swal.fire({
                icon: 'success',
                title: '¡Actualizado!',
                text: `El nivel "${nombre}" se actualizó correctamente.`,
                confirmButtonColor: '#28a745',
                timer: 2000,
                showConfirmButton: true
            });
        } else {
            // Creación
            await manager.crearNivel({ nombre, color }, usuarioActual);
            await Swal.fire({
                icon: 'success',
                title: '¡Creado!',
                text: `El nivel "${nombre}" se creó correctamente.`,
                confirmButtonColor: '#28a745',
                timer: 2000,
                showConfirmButton: true
            });
        }
        // Redirigir después del Swal
        window.location.href = '/usuarios/administrador/riesgoNivel/riesgoNivel.html';
    } catch (error) {
        console.error(error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudo guardar el nivel. Intente de nuevo.',
            confirmButtonColor: '#dc3545'
        });
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function cancelar() {
    window.location.href = '/usuarios/administrador/riesgoNivel/riesgoNivel.html';
}

async function inicializar() {
    usuarioActual = obtenerUsuarioActual();
    if (!usuarioActual?.organizacionCamelCase) {
        await Swal.fire({
            icon: 'error',
            title: 'Error de organización',
            text: 'No se pudo identificar la organización del usuario',
            confirmButtonColor: '#dc3545'
        });
        window.location.href = '/usuarios/administrador/riesgoNivel/riesgoNivel.html';
        return;
    }
    manager = new RiesgoNivelManager();
    nivelId = obtenerIdDeURL();

    document.getElementById('formNivel').addEventListener('submit', guardarNivel);
    document.getElementById('btnCancelar').addEventListener('click', cancelar);
    document.getElementById('btnVolverLista').addEventListener('click', cancelar);

    // Preview de color en tiempo real
    const colorInput = document.getElementById('color');
    const preview = document.getElementById('colorPreview');
    if (colorInput && preview) {
        colorInput.addEventListener('input', () => {
            preview.style.backgroundColor = colorInput.value;
        });
        preview.style.backgroundColor = colorInput.value;
    }

    if (nivelId) {
        await cargarDatosParaEdicion();
        // Cambiar título si es edición
        const mainTitle = document.querySelector('.main-title');
        if (mainTitle) {
            mainTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Nivel de Riesgo';
        }
        const description = document.querySelector('.header-description-text');
        if (description) {
            description.textContent = 'Modifica los datos del nivel de riesgo existente';
        }
    }
}

document.addEventListener('DOMContentLoaded', inicializar);