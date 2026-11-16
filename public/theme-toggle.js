function isThemeToggleExcluded() {
    const excludedPages = ['checkout', 'admin', 'settings', 'orders'];
    const currentPath = window.location.pathname.toLowerCase();

    return (
        excludedPages.some(page => currentPath.includes(page)) ||
        (document.body && document.body.hasAttribute('data-no-theme-toggle'))
    );
}

document.addEventListener('DOMContentLoaded', () => {
    if (isThemeToggleExcluded()) {
        const existingBtn = document.getElementById('floating-theme-toggle');
        if (existingBtn) existingBtn.remove();
        return;
    }

    const savedTheme = localStorage.getItem('theme') || 'light';
    let toggleBtn = document.getElementById('floating-theme-toggle');
    if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'floating-theme-toggle';
        toggleBtn.className = 'theme-toggle-btn';
        toggleBtn.setAttribute('aria-label', 'Dark Mode umschalten');
        document.body.appendChild(toggleBtn);
        
        toggleBtn.addEventListener('click', toggleDarkMode);
    }

    updateAllThemeIcons(savedTheme);
});

function updateAllThemeIcons(theme) {
    const buttons = document.querySelectorAll('#floating-theme-toggle, .theme-toggle-btn, .theme-toggle');
    
    buttons.forEach(btn => {
        btn.innerHTML = theme === 'dark' 
            ? '<i class="fa-solid fa-sun"></i>' 
            : '<i class="fa-solid fa-moon"></i>';
    });
}

function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    if (document.body) {
        document.body.setAttribute('data-theme', newTheme);
    }
    localStorage.setItem('theme', newTheme);
    
    updateAllThemeIcons(newTheme);
}

window.toggleDarkMode = toggleDarkMode;

window.addEventListener('pageshow', () => {
    if (isThemeToggleExcluded()) return;
    const savedTheme = localStorage.getItem('theme') || 'light';
    updateAllThemeIcons(savedTheme);
});