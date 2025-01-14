/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{js,tsx}'],
    theme: {
        extend: {},
    },
    plugins: [require('daisyui')],
    daisyui: {
        themes: ["light", "dark", "cupcake"],
    },
};
