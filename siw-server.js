const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });


let hostPass = "siw69420";
const lobbyMap = new Map();

function getRandomInt(min, max) {
    min = Math.ceil(min);   // Ensure min is an integer
    max = Math.floor(max);  // Ensure max is an integer
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
function UnassignJobs(lobbyCode, ended = false) {
    let lobby = lobbyMap.get(lobbyCode);
    
    let allMembers = [];

    lobby.jobs.forEach(job => {
        if (job.name !== 'Unassigned') {
            let jobMembers = job.members.splice(0, job.members.length); // Removes all elements
            allMembers.push(...jobMembers); // Spread operator to flatten the array
        }
      });

    lobby.jobs[lobby.jobs.length - 1].members.push(...allMembers);

    allMembers.forEach((member, index) => {
        // Randomly select one of the eligible objects
        const selectedJob = lobby.jobs[lobby.jobs.length - 1];

        console.log(`Added ${member.name} to ${selectedJob.name}`);
        
        member.client.send(JSON.stringify({job: ended ? "Ended" : selectedJob.name, goal: selectedJob.goal, color: selectedJob.color}));
    });
}

function AssignJobs(lobbyCode) {
    let lobby = lobbyMap.get(lobbyCode);
    let unassigned = lobby.jobs[lobby.jobs.length - 1].members;
    let members = unassigned.splice(0, unassigned.length); // Removes all elements
    const filteredJobs = lobby.jobs.filter(obj => obj.name !== "Unassigned");

    members.forEach((member, index) => {
        const eligibleJobs = filteredJobs.filter(job => job.max == "No Max" || job.members.length < job.max);
        const priorityJobs = eligibleJobs.filter(job => job.priority);
        const jobsToSearch = priorityJobs.length > 0 ? priorityJobs : eligibleJobs;

        // Randomly select one of the eligible objects
        const randomIndex = getRandomInt(0, jobsToSearch.length - 1);
        const selectedJob = jobsToSearch[randomIndex];

        // Add the new element to the selected object's elements array
        selectedJob.members.push(member);

        console.log(`Added ${member.name} to ${selectedJob.name}`);
        
        member.client.send(JSON.stringify({job: selectedJob.name, goal: selectedJob.goal, color: selectedJob.color}));
    });
}

function AssignJobInProgress(lobbyCode, newMember) {
    let lobby = lobbyMap.get(lobbyCode);
    
    const filteredJobs = lobby.jobs.filter(obj => obj.name !== "Unassigned");
    const eligibleJobs = filteredJobs.filter(job => job.max == "No Max" || job.members.length < job.max);
    const priorityJobs = eligibleJobs.filter(job => job.priority);
    const jobsToSearch = priorityJobs.length > 0 ? priorityJobs : eligibleJobs;

    // Check if there are any eligible objects
    if (jobsToSearch.length > 0) {
        // Randomly select one of the eligible objects
        const randomIndex = getRandomInt(0, jobsToSearch.length - 1);
        const selectedJob = jobsToSearch[randomIndex];

        // Add the new element to the selected object's elements array
        selectedJob.members.push(newMember);

        console.log(`Added ${newMember.name} to ${selectedJob.name}`);

        newMember.client.send(JSON.stringify({job: selectedJob.name, goal: selectedJob.goal, color: selectedJob.color}));
    } else {
        console.log('ERROR: NO ROOM IN JOBS');
    }
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('message', (message) => {
    console.log('Received: %s', message);
    let data = JSON.parse(message);
    
    if (data?.setBlurbsPass)
    {
        hostPass = data.setBlurbsPass;
    }
    if (data?.hostPass == hostPass && data?.lobbyCode)
    {
        if (lobbyMap.has(data.lobbyCode))
        {
            let lobby = lobbyMap.get(data.lobbyCode);
            if (data.endLobby)
            {
                lobby.jobs.forEach(job => {
                    job.members.forEach(member => {
                        member.client.send(JSON.stringify({lobbyClosed: true}));
                    });
                });

                lobbyMap.delete(data.lobbyCode);
                ws.send(JSON.stringify('Server response: Lobby Deleted!'));
                return;
            }
            else if (data.startLobby)
            {
                console.log("IN PROGRESS");
                lobby.inProgress = true;
                let jobs = data.jobs;
    
                if (jobs.length == 0)
                {
                    ws.send(JSON.stringify("Server Response: ERROR NO JOBS!"));
                    return;
                }
    
                jobs.push({name: "Unassigned", color: "#000000", max: "No Max", members: []});
                lobby.jobs = jobs;
                
                AssignJobs(data.lobbyCode);
            }
            else if (data.createLobby)
            {
                ws.send(JSON.stringify('Server response: Lobby Already Exists!'));
                return;
            }
            else if (data.resetLobby)
            {
                lobby.inProgress = false;

                UnassignJobs(data.lobbyCode);
                
                ws.send(JSON.stringify('Server response: Lobby Reset!'));
            }
        }
        else if (data.createLobby)
        {
            let lobbyData = {
                inProgress: false,
                memberCount: 0,
                hostClient: ws,
                jobs: []
            };
    
            lobbyMap.set(data.lobbyCode, lobbyData);
        }
    }
    if (data?.joinLobby)
    {
        if (!lobbyMap.has(data.joinLobby))
        {
            ws.send(JSON.stringify('Server response: Lobby not found!'));
            return;
        }

        let lobby = lobbyMap.get(data.joinLobby);

        console.log(lobby.inProgress);
        const filteredJobs = lobby.jobs.filter(obj => obj.name !== "Unassigned");

        console.log(filteredJobs);
        if (lobby.inProgress && !filteredJobs.some(obj => obj.max == "No Max"))
        {
            let totalJobs = filteredJobs.reduce((sum, obj) => sum + Number(obj.max), 0);
            if (lobby.memberCount >= totalJobs)
            {
                ws.send(JSON.stringify('Server response: Lobby full!'));
                return;
            }
        }

        if (lobby.inProgress)
        {
            //PICK FROM REMAINING JOBS
            AssignJobInProgress(data.joinLobby, {name: data.name, client: ws});
            lobby.memberCount++;
            lobby.hostClient.send(JSON.stringify({newMember: data.name}));
        }
        else
        {
            lobby.jobs[lobby.jobs.length - 1].members.push({name: data.name, client: ws});
            lobby.memberCount++;
            lobby.hostClient.send(JSON.stringify({newMember: data.name}));
        }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    let leavingMember = null;
    let hostClient = null;

    // Use for...of to iterate over map values directly
    for (const value of lobbyMap.values()) { // Changed myMap to lobbyMap
        console.log(value);
        for (let j = 0; j < value.jobs.length; j++) {
            console.log(value.jobs[j]);
            // Assuming value.jobs[j] is an array of members and you're looking for the member with a specific client
            let member = value.jobs[j].members.find(x => x.client === ws); // Use strict equality
            console.log(member);

            if (member) { // Correct variable name
                leavingMember = member;
                hostClient = value.hostClient;
                break; // Break inner loop
            }
        }
        if (leavingMember !== null && hostClient !== null) { // Check if found
            break; // Break outer loop if client found
        }
    }

    //SEND NOTIFICATION
    if (hostClient)
        hostClient.send(JSON.stringify({removeMember: leavingMember.name}));
    else
        console.log("HOST CLIENT NOT FOUND, MEMBER LEFT");
  });
});