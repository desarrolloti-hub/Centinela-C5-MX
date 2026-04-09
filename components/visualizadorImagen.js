// /components/visualizadorImagen.js
// Componente para visualizar imágenes en modal

class VisualizadorImagen {
    constructor() {
        this.modal = null;
        this.modalImg = null;
        this.modalCaption = null;
        this.closeBtn = null;
        this.prevBtn = null;
        this.nextBtn = null;
        this.currentIndex = 0;
        this.images = [];
        this.init();
    }

    init() {
        // Crear el modal si no existe
        if (!document.getElementById('visualizadorImagenModal')) {
            const modalHTML = `
                <div id="visualizadorImagenModal" class="visualizador-modal">
                    <span class="visualizador-close">&times;</span>
                    <button class="visualizador-nav visualizador-prev">&#10094;</button>
                    <button class="visualizador-nav visualizador-next">&#10095;</button>
                    <div class="visualizador-modal-content">
                        <img class="visualizador-modal-img" id="visualizadorImg" src="" alt="Imagen">
                        <div class="visualizador-modal-caption" id="visualizadorCaption"></div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        this.modal = document.getElementById('visualizadorImagenModal');
        this.modalImg = document.getElementById('visualizadorImg');
        this.modalCaption = document.getElementById('visualizadorCaption');
        this.closeBtn = this.modal.querySelector('.visualizador-close');
        this.prevBtn = this.modal.querySelector('.visualizador-prev');
        this.nextBtn = this.modal.querySelector('.visualizador-next');

        // Event listeners
        this.closeBtn.addEventListener('click', () => this.cerrar());
        this.prevBtn.addEventListener('click', () => this.anterior());
        this.nextBtn.addEventListener('click', () => this.siguiente());

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.cerrar();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (this.modal.style.display === 'block') {
                if (e.key === 'Escape') this.cerrar();
                if (e.key === 'ArrowLeft') this.anterior();
                if (e.key === 'ArrowRight') this.siguiente();
            }
        });

        // Agregar estilos
        this.agregarEstilos();
    }

    agregarEstilos() {
        if (document.getElementById('visualizadorImagenStyles')) return;

        const styles = `
            <style id="visualizadorImagenStyles">
                .visualizador-modal {
                    display: none;
                    position: fixed;
                    z-index: 9999;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.95);
                    animation: visualizadorFadeIn 0.3s;
                }

                @keyframes visualizadorFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .visualizador-modal-content {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    max-width: 90vw;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .visualizador-modal-img {
                    max-width: 90vw;
                    max-height: 80vh;
                    object-fit: contain;
                    border-radius: 4px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }

                .visualizador-modal-caption {
                    color: #fff;
                    margin-top: 12px;
                    font-size: 14px;
                    text-align: center;
                    max-width: 80vw;
                    padding: 8px 16px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 20px;
                }

                .visualizador-close {
                    position: absolute;
                    top: 20px;
                    right: 35px;
                    color: #fff;
                    font-size: 40px;
                    font-weight: bold;
                    cursor: pointer;
                    z-index: 10000;
                    width: 50px;
                    height: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255,255,255,0.1);
                    border-radius: 50%;
                    transition: all 0.3s;
                }

                .visualizador-close:hover {
                    background: rgba(255,255,255,0.2);
                    transform: scale(1.1);
                }

                .visualizador-nav {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    background: rgba(255,255,255,0.1);
                    color: white;
                    border: none;
                    font-size: 30px;
                    padding: 20px 15px;
                    cursor: pointer;
                    z-index: 10000;
                    border-radius: 8px;
                    transition: all 0.3s;
                }

                .visualizador-nav:hover {
                    background: rgba(255,255,255,0.2);
                }

                .visualizador-prev {
                    left: 20px;
                }

                .visualizador-next {
                    right: 20px;
                }

                .visualizador-nav:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }

                @media (max-width: 768px) {
                    .visualizador-nav {
                        font-size: 20px;
                        padding: 15px 10px;
                    }
                    .visualizador-close {
                        top: 10px;
                        right: 10px;
                        width: 40px;
                        height: 40px;
                        font-size: 30px;
                    }
                }
            </style>
        `;
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    abrir(images, index = 0, comentarios = []) {
        this.images = images.map((img, i) => ({
            url: typeof img === 'string' ? img : img.url,
            comentario: comentarios[i] || (typeof img === 'object' && img.comentario ? img.comentario : '')
        }));
        
        this.currentIndex = Math.min(index, this.images.length - 1);
        this.actualizarImagen();
        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
        // Nuevo método para abrir el visualizador directamente con datos
    abrirDesdeDatos(images, index = 0) {
        this.images = images.map((img, i) => ({
            url: img.url,
            comentario: img.comentario || (typeof img === 'object' && img.comentario ? img.comentario : '')
        }));
        
        this.currentIndex = Math.min(index, this.images.length - 1);
        this.actualizarImagen();
        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    cerrar() {
        this.modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    anterior() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.actualizarImagen();
        }
    }

    siguiente() {
        if (this.currentIndex < this.images.length - 1) {
            this.currentIndex++;
            this.actualizarImagen();
        }
    }

    actualizarImagen() {
        if (this.images.length === 0) return;
        
        const img = this.images[this.currentIndex];
        this.modalImg.src = img.url;
        this.modalCaption.textContent = img.comentario || `Imagen ${this.currentIndex + 1} de ${this.images.length}`;
        
        // Actualizar botones de navegación
        this.prevBtn.style.display = this.images.length > 1 ? 'block' : 'none';
        this.nextBtn.style.display = this.images.length > 1 ? 'block' : 'none';
        this.prevBtn.disabled = this.currentIndex === 0;
        this.nextBtn.disabled = this.currentIndex === this.images.length - 1;
    }
}

// Crear instancia global
window.visualizadorImagen = new VisualizadorImagen();
export default window.visualizadorImagen;