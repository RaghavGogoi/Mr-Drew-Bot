async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        document.getElementById('stat-users').innerText = data.users.toLocaleString();
        document.getElementById('stat-servers').innerText = data.servers;
        document.getElementById('stat-ping').innerText = data.ping + 'ms';
        document.getElementById('stat-cmds').innerText = data.commands;
    } catch (e) { console.error("Stats error", e); }
}

// Auto-Mod Toggle Functionality
document.getElementById('automod-toggle').addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    await fetch('/api/guild/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoMod: isEnabled })
    });
    alert(`Auto-Mod is now ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
});

// Initialize
lucide.createIcons();
fetchStats();
setInterval(fetchStats, 5000); // Live update every 5 seconds