/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // El formulario de noticia manual sube la foto dentro de la Server
    // Action, y el limite de serie (1 MB) corta cualquier foto de movil
    // antes de que llegue al servidor. Se sube justo hasta el tope de Vercel
    // (4,5 MB de cuerpo de peticion): mas alto no serviria de nada porque
    // corta la plataforma, y queda por encima del tope que valida la accion
    // (MAX_MANUAL_IMAGE_BYTES, 4 MB) para que el que avise sea nuestro
    // mensaje y no un 413 opaco.
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
