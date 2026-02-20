/**
 * @file theme.js
 * @description Theme management (light/dark mode)
 * @requires None
 */

export function loadTheme() {
    const isLight = localStorage.getItem('chrono_theme') === 'light';
    if (isLight) {
        document.body.classList.add('light-mode');
        document.getElementById('themeIconSun').classList.remove('hidden');
        document.getElementById('themeIconMoon').classList.add('hidden');
    }
}

export function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('chrono_theme', isLight ? 'light' : 'dark');

    const themeIconSun = document.getElementById('themeIconSun');
    const themeIconMoon = document.getElementById('themeIconMoon');

    if (isLight) {
        themeIconSun.classList.remove('hidden');
        themeIconMoon.classList.add('hidden');
    } else {
        themeIconSun.classList.add('hidden');
        themeIconMoon.classList.remove('hidden');
    }
}
