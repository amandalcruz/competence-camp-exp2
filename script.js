const firebaseConfig = {
    apiKey: "AIzaSyDXNq53T2a52M31Ims7iSV_2ZhJHl7hvi0",
    authDomain: "competence-camp-exp2.firebaseapp.com",
    databaseURL: "https://competence-camp-exp2-default-rtdb.firebaseio.com",
    projectId: "competence-camp-exp2",
    storageBucket: "competence-camp-exp2.firebasestorage.app",
    messagingSenderId: "836219510175",
    appId: "1:836219510175:web:c9006d99b64d8ef2e831aa",
    measurementId: "G-B1Z7ZT87TW"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();

let people = [], skills = [], groups = [], skillPlans = {}, evaluations = {}, groupTargets = {}, customActionPlans = {};
let selectedMembers = [];
let radarChart = null;
let editingInfo = { type: null, index: null };

window.onload = () => {
    db.ref('pdi_data').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        people = data.people || [];
        skills = data.skills || [];
        groups = data.groups || [];
        skillPlans = data.skillPlans || {};
        evaluations = data.evaluations || {};
        groupTargets = data.groupTargets || {};
        customActionPlans = data.customActionPlans || {};
        
        people.sort((a, b) => a.name.localeCompare(b.name));
        skills.sort((a, b) => a.name.localeCompare(b.name));
        groups.sort((a, b) => a.name.localeCompare(b.name));

        renderAll();
    });
};

function sync(specificNode = null, data = null) {
    if (specificNode) {
        db.ref(`pdi_data/${specificNode}`).set(data);
    } else {
        db.ref('pdi_data').update({ 
            people, skills, groups, skillPlans, evaluations, groupTargets, customActionPlans 
        });
    }
}

// FUNÇÃO MESTRE DE FILTRAGEM
function getRelevantSkillsForPerson(personName) {
    const personTeams = groups.filter(g => g.members && g.members.includes(personName)).map(g => g.name);
    return skills.filter(s => {
        if (!s.teams || s.teams.length === 0) return true; // Global
        return s.teams.some(team => personTeams.includes(team)); // Se a pessoa está em algum dos times da comp
    });
}

function getEffectiveTarget(personName, skillName) {
    let maxTarget = (evaluations[personName] && evaluations[personName][skillName]?.target) || 0;
    groups.forEach(group => {
        if (group.members && group.members.includes(personName)) {
            const groupTarg = (groupTargets[group.name] && groupTargets[group.name][skillName]) || 0;
            if (groupTarg > maxTarget) maxTarget = groupTarg;
        }
    });
    return maxTarget;
}

// NAVEGAÇÃO
function openMainTab(evt, tabId) {
    document.querySelectorAll(".main-content").forEach(c => c.classList.remove("active"));
    document.querySelectorAll(".main-tab").forEach(t => t.classList.remove("active"));
    document.getElementById(tabId).classList.add("active");
    evt.currentTarget.classList.add("active");
    if(tabId === 'plano_acao') renderActionPlanTable();
    if(tabId === 'desenvolvimento') renderPDIRadar();
    if(tabId === 'matriz') renderMatrix();
}

function openSubTab(evt, subTabId) {
    const parent = evt.currentTarget.closest('.main-content');
    parent.querySelectorAll(".sub-content").forEach(c => c.classList.remove("active"));
    parent.querySelectorAll(".sub-tab").forEach(t => t.classList.remove("active"));
    document.getElementById(subTabId).classList.add("active");
    evt.currentTarget.classList.add("active");
}

// CADASTROS
function addPerson() {
    const name = document.getElementById('personName').value.trim();
    const role = document.getElementById('personRole').value;
    const manager = document.getElementById('personManager').value;
    if(!name) return alert("Nome obrigatório");
    
    if (editingInfo.type === 'people') {
        people[editingInfo.index] = { name, role, manager };
        editingInfo = { type: null, index: null };
        document.getElementById('personFormTitle').innerText = "Gerenciar Pessoas";
    } else {
        people.push({ name, role, manager });
    }
    sync('people', people);
    document.getElementById('personName').value = "";
    document.getElementById('personRole').value = "";
    document.getElementById('personManager').value = "";
}

function addSkill() {
    const name = document.getElementById('skillName').value.trim();
    const description = document.getElementById('skillDescription').value;
    const type = document.getElementById('skillType').value;
    
    // Captura múltiplos times selecionados
    const teamSelect = document.getElementById('skillTeamSelect');
    const selectedTeams = Array.from(teamSelect.selectedOptions).map(opt => opt.value);

    if(!name) return alert("Nome obrigatório");
    
    const skillData = { name, description, type, teams: selectedTeams };
    
    if (editingInfo.type === 'skills') {
        skills[editingInfo.index] = skillData;
        editingInfo = { type: null, index: null };
        document.getElementById('skillFormTitle').innerText = "Competência";
    } else {
        skills.push(skillData);
    }
    sync('skills', skills);
    resetSkillForm();
}

function resetSkillForm() {
    document.getElementById('skillName').value = "";
    document.getElementById('skillDescription').value = "";
    document.getElementById('skillTeamSelect').selectedIndex = -1;
}

function editItem(type, index) {
    editingInfo = { type, index };
    if (type === 'people') {
        const p = people[index];
        document.getElementById('personName').value = p.name;
        document.getElementById('personRole').value = p.role;
        document.getElementById('personManager').value = p.manager;
    } else if (type === 'skills') {
        const s = skills[index];
        document.getElementById('skillName').value = s.name;
        document.getElementById('skillDescription').value = s.description;
        document.getElementById('skillType').value = s.type;
        // Selecionar múltiplos times no select
        const select = document.getElementById('skillTeamSelect');
        Array.from(select.options).forEach(opt => opt.selected = (s.teams || []).includes(opt.value));
    } else if (type === 'groups') {
        const g = groups[index];
        document.getElementById('groupName').value = g.name;
        selectedMembers = g.members ? [...g.members] : [];
        renderTags();
    }
}

function deleteItem(type, index) {
    if(confirm("Excluir definitivamente?")) {
        if(type==='people') people.splice(index,1);
        if(type==='skills') skills.splice(index,1);
        if(type==='groups') groups.splice(index,1);
        sync(type, type === 'people' ? people : (type === 'skills' ? skills : groups));
    }
}

// REGRAS
function saveSkillPlan() {
    const skill = document.getElementById('skillPlanSelect').value;
    if(!skill) return alert("Selecione uma competência.");
    skillPlans[skill] = { 
        n3: document.getElementById('planN3').value, 
        n6: document.getElementById('planN6').value, 
        n9: document.getElementById('planN9').value 
    };
    sync('skillPlans', skillPlans);
    alert("Regras salvas!");
    document.getElementById('skillPlanForm').style.display = 'none';
}

function loadSkillPlanForm() {
    const skill = document.getElementById('skillPlanSelect').value;
    const form = document.getElementById('skillPlanForm');
    if(!skill) { form.style.display = 'none'; return; }
    form.style.display = 'block';
    const plan = skillPlans[skill] || { n3: '', n6: '', n9: '' };
    document.getElementById('planN3').value = plan.n3;
    document.getElementById('planN6').value = plan.n6;
    document.getElementById('planN9').value = plan.n9;
}

function renderSkillPlansTable() { 
    const body = document.getElementById('skillPlansTableBody');
    body.innerHTML = Object.keys(skillPlans).sort().map(k => `
        <tr>
            <td><strong>${k}</strong></td>
            <td><small>${skillPlans[k].n3 || '-'}</small></td>
            <td><small>${skillPlans[k].n6 || '-'}</small></td>
            <td><small>${skillPlans[k].n9 || '-'}</small></td>
            <td class="actions">
                <button onclick="editSkillPlan('${k}')" class="btn-edit"><i class="fas fa-edit"></i></button>
            </td>
        </tr>`).join(''); 
}

function editSkillPlan(skillName) {
    document.getElementById('skillPlanSelect').value = skillName;
    loadSkillPlanForm();
}

// MATRIZ
function renderMatrix() {
    const body = document.getElementById('matrixBody');
    const fName = document.getElementById('filterMatrixName').value.toLowerCase();
    const fStatus = document.getElementById('filterMatrixStatus').value;

    let html = "";
    people.forEach(p => {
        if (fName && !p.name.toLowerCase().includes(fName)) return;

        const relevant = getRelevantSkillsForPerson(p.name);

        relevant.forEach(s => {
            const ev = (evaluations[p.name] && evaluations[p.name][s.name]) || { current: 0, target: 0 };
            const effectiveTarget = getEffectiveTarget(p.name, s.name);
            const gapValue = effectiveTarget - ev.current;
            const statusText = ev.current >= effectiveTarget ? 'OK' : 'GAP';
            
            if (fStatus && statusText !== fStatus) return;

            const key = `${p.name}_${s.name}`;
            const pData = customActionPlans[key] || { hasPlan: 'Não' };

            html += `<tr>
                <td>${p.name}</td>
                <td>${s.name} <br><small style="color:var(--primary)">${s.teams?.length ? s.teams.join(', ') : 'Global'}</small></td>
                <td>${ev.current}</td>
                <td>${effectiveTarget}</td>
                <td style="font-weight:bold; color: ${gapValue > 0 ? 'red' : 'green'}">${gapValue > 0 ? gapValue : 0}</td>
                <td><span class="status-tag status-${statusText.toLowerCase()}">${statusText}</span></td>
                <td>
                    <select onchange="updateActionData('${p.name}','${s.name}','hasPlan',this.value)">
                        <option value="Não" ${pData.hasPlan === 'Não' ? 'selected' : ''}>Não</option>
                        <option value="Sim" ${pData.hasPlan === 'Sim' ? 'selected' : ''}>Sim</option>
                    </select>
                </td>
            </tr>`;
        });
    });
    body.innerHTML = html;
}

function updateEvalRealTime(person, skill, field, value) {
    let val = parseInt(value) || 0;
    if (!evaluations[person]) evaluations[person] = {};
    if (!evaluations[person][skill]) evaluations[person][skill] = { current: 0, target: 0 };
    evaluations[person][skill][field] = val;
    sync('evaluations', evaluations);
}

function updateActionData(person, skill, field, value) {
    const key = `${person}_${skill}`;
    if (!customActionPlans[key]) customActionPlans[key] = {};
    customActionPlans[key][field] = value;
    sync('customActionPlans', customActionPlans);
}

// PDI & RADAR
function renderPDIRadar() {
    const person = document.getElementById('pdiPersonSelect').value;
    const container = document.getElementById('pdiActionPlan');
    if (!person) { if(radarChart) radarChart.destroy(); container.innerHTML = ""; return; }

    const relevant = getRelevantSkillsForPerson(person);
    const dataCurrent = relevant.map(s => (evaluations[person] && evaluations[person][s.name]?.current) || 0);
    const dataTarget = relevant.map(s => getEffectiveTarget(person, s.name));

    const ctx = document.getElementById('radarChart').getContext('2d');
    if (radarChart) radarChart.destroy();
    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: relevant.map(s => s.name),
            datasets: [
                { label: 'Atual', data: dataCurrent, backgroundColor: 'rgba(37, 99, 235, 0.2)', borderColor: '#2563eb' },
                { label: 'Alvo', data: dataTarget, backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10b981' }
            ]
        },
        options: { 
            maintainAspectRatio: false,
            scales: { r: { min: 0, max: 9, ticks: { stepSize: 3 } } }
        }
    });

    let html = "<h3>Sugestões de Desenvolvimento</h3>";
    relevant.forEach(s => {
        const ev = (evaluations[person] && evaluations[person][s.name]?.current) || 0;
        const target = getEffectiveTarget(person, s.name);
        if (ev < target) {
            const plan = skillPlans[s.name] || {};
            let action = target <= 3 ? plan.n3 : (target <= 6 ? plan.n6 : plan.n9);
            html += `<div class="pdi-item"><strong>${s.name}</strong> <span class="gap-badge">Alvo: ${target}</span><p>${action || "Defina regras para esta competência."}</p></div>`;
        }
    });
    container.innerHTML = html;
}

function getDescriptionForLevel(skillName, level) {
    if (!level || level == 0) return "";
    const plan = skillPlans[skillName];
    if (!plan) return "-";
    if (level <= 3) return plan.n3 || "-";
    if (level <= 6) return plan.n6 || "-";
    return plan.n9 || "-";
}

function renderIndividualEvalTable() {
    const person = document.getElementById('evalPersonSelect').value;
    const body = document.getElementById('individualEvalBody');
    if (!person) { body.innerHTML = ""; return; }

    const relevant = getRelevantSkillsForPerson(person);

    body.innerHTML = relevant.map(s => {
        const ev = (evaluations[person] && evaluations[person][s.name]) || { current: 0, target: 0 };
        return `<tr>
            <td>${s.name}</td>
            <td><input type="number" min="0" max="9" step="3" value="${ev.current}" oninput="updateEvalRealTime('${person}','${s.name}','current',this.value)"></td>
            <td class="desc-cell">${getDescriptionForLevel(s.name, ev.current)}</td>
            <td><input type="number" min="0" max="9" step="3" value="${ev.target}" oninput="updateEvalRealTime('${person}','${s.name}','target',this.value)"></td>
            <td class="desc-cell">${getDescriptionForLevel(s.name, ev.target)}</td>
        </tr>`;
    }).join('');
}

function renderGroupEvalTable() {
    const groupName = document.getElementById('evalGroupSelect').value;
    const container = document.getElementById('groupEvalContainer');
    const body = document.getElementById('groupEvalBody');
    if (!groupName) { container.style.display = "none"; return; }
    container.style.display = "block";

    const relevant = skills.filter(s => !s.teams || s.teams.length === 0 || s.teams.includes(groupName));

    body.innerHTML = relevant.map(s => {
        const target = (groupTargets[groupName] && groupTargets[groupName][s.name]) || 0;
        return `<tr>
            <td>${s.name}</td>
            <td><input type="number" step="3" min="0" max="9" value="${target}" oninput="updateGroupTarget('${groupName}','${s.name}',this.value)"></td>
            <td class="desc-cell">${getDescriptionForLevel(s.name, target)}</td>
        </tr>`;
    }).join('');
}

function updateGroupTarget(group, skill, value) {
    let val = parseInt(value) || 0;
    if (!groupTargets[group]) groupTargets[group] = {};
    groupTargets[group][skill] = val;
    sync('groupTargets', groupTargets);
}

function addMemberToGroup(select) {
    const name = select.value;
    if(name && !selectedMembers.includes(name)) { selectedMembers.push(name); renderTags(); }
    select.value = "";
}

function renderTags() { 
    document.getElementById('selectedTagsContainer').innerHTML = selectedMembers.map(m => `<span class="tag-chip">${m} <i class="fas fa-times tag-close" onclick="removeTag('${m}')"></i></span>`).join(''); 
}

function removeTag(name) { selectedMembers = selectedMembers.filter(m => m !== name); renderTags(); }

function saveGroup() {
    const name = document.getElementById('groupName').value.trim();
    if(!name || selectedMembers.length === 0) return alert("Preencha nome e membros.");
    if (editingInfo.type === 'groups') {
        groups[editingInfo.index] = { name, members: [...selectedMembers] };
        editingInfo = { type: null, index: null };
    } else {
        groups.push({ name, members: [...selectedMembers] });
    }
    sync('groups', groups);
    selectedMembers = []; document.getElementById('groupName').value = ""; renderTags();
}

function renderAll() { renderPeople(); renderSkills(); renderGroups(); renderSkillPlansTable(); updateAllSelects(); }
function renderPeople() { document.getElementById('peopleList').innerHTML = people.map((p, i) => `<tr><td>${p.name}</td><td>${p.role}</td><td>${p.manager}</td><td class="actions"><button onclick="editItem('people',${i})" class="btn-edit"><i class="fas fa-edit"></i></button><button onclick="deleteItem('people',${i})" class="btn-delete"><i class="fas fa-trash"></i></button></td></tr>`).join(''); }

function renderSkills() { 
    document.getElementById('skillsList').innerHTML = skills.map((s, i) => `
    <tr>
        <td>${s.name}</td>
        <td>${s.type}</td>
        <td>${s.teams && s.teams.length > 0 ? s.teams.join(', ') : 'Global'}</td>
        <td class="actions">
            <button onclick="editItem('skills',${i})" class="btn-edit"><i class="fas fa-edit"></i></button>
            <button onclick="deleteItem('skills',${i})" class="btn-delete"><i class="fas fa-trash"></i></button>
        </td>
    </tr>`).join(''); 
}

function renderGroups() { document.getElementById('groupTable').innerHTML = groups.map((g, i) => `<tr><td>${g.name}</td><td>${(g.members || []).join(', ')}</td><td><button onclick="editItem('groups',${i})" class="btn-edit"><i class="fas fa-edit"></i></button><button onclick="deleteItem('groups',${i})" class="btn-delete"><i class="fas fa-trash"></i></button></td></tr>`).join(''); }

function updateAllSelects() {
    const pOpt = '<option value="">Selecione...</option>' + people.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    const sOpt = '<option value="">Selecione...</option>' + skills.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    const gOpt = '<option value="">Selecione...</option>' + groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    const teamOpt = groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    
    document.getElementById('personSelectField').innerHTML = pOpt;
    document.getElementById('skillPlanSelect').innerHTML = sOpt;
    document.getElementById('evalPersonSelect').innerHTML = pOpt;
    document.getElementById('evalGroupSelect').innerHTML = gOpt;
    document.getElementById('pdiPersonSelect').innerHTML = pOpt;
    document.getElementById('filterActionPlanPerson').innerHTML = pOpt;
    document.getElementById('skillTeamSelect').innerHTML = teamOpt;
}

function renderActionPlanTable() {
    const person = document.getElementById('filterActionPlanPerson').value;
    const body = document.getElementById('actionPlanTableBody');
    if (!person) { body.innerHTML = ""; return; }

    const relevant = getRelevantSkillsForPerson(person);

    body.innerHTML = relevant.filter(s => {
        const key = `${person}_${s.name}`;
        return customActionPlans[key] && customActionPlans[key].hasPlan === 'Sim';
    }).map(s => {
        const key = `${person}_${s.name}`;
        const pData = customActionPlans[key] || {};
        return `<tr>
                <td><strong>${s.name}</strong><br><small>Alvo: ${getEffectiveTarget(person, s.name)}</small></td>
                <td><textarea onchange="updateActionData('${person}','${s.name}','customAction',this.value)">${pData.customAction || ''}</textarea></td>
                <td><input type="date" value="${pData.deadline || ''}" onchange="updateActionData('${person}','${s.name}','deadline',this.value)"></td>
                <td><select onchange="updateActionData('${person}','${s.name}','priority',this.value)">
                    <option value="Baixa" ${pData.priority === 'Baixa' ? 'selected' : ''}>Baixa</option>
                    <option value="Média" ${pData.priority === 'Média' ? 'selected' : ''}>Média</option>
                    <option value="Alta" ${pData.priority === 'Alta' ? 'selected' : ''}>Alta</option>
                </select></td>
            </tr>`;
    }).join('');
}
