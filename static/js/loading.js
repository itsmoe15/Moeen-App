// /js/loading.js

// Function to initialize the loading overlay
export function initializeLoadingOverlay() {
    const loadingOverlay = document.getElementById("loading-overlay");
    const loadingMessageElement = document.getElementById("loading-message");
    
    let loadingMessages = [];
    let loadingMessageInterval;

    // Function to fetch loading messages from the text file
    function loadLoadingMessages() {
        fetch('/static/messages/loading_messages.txt')
            .then(response => response.text())
            .then(text => {
                // Split the text into an array of messages
                loadingMessages = text.split('\n').filter(line => line.trim() !== '');
                // Start updating the loading message
                updateLoadingMessage();
                loadingMessageInterval = setInterval(updateLoadingMessage, 10000);
            })
            .catch(error => {
                console.error('Error loading messages:', error);
                loadingMessageElement.innerText = "Loading, please wait...";
            });
    }

    // Function to update the loading message with flip animation
    function updateLoadingMessage() {
        if (loadingMessages.length > 0) {
            // Add the 'flip' class to trigger the flip animation
            loadingMessageElement.classList.add('flip');

            // After the flip animation duration, change the text and remove the 'flip' class
            setTimeout(() => {
                const randomIndex = Math.floor(Math.random() * loadingMessages.length);
                const message = loadingMessages[randomIndex];
                loadingMessageElement.innerText = message;
                loadingMessageElement.classList.remove('flip');
            }, 600); // Duration matches the CSS transition (0.6s)
        }
    }

    // Helper function to get a random integer between min and max milliseconds
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }

    // Function to show the loading overlay
    window.showLoadingOverlay = function() {
        loadingOverlay.style.display = "flex";
        // Start loading messages
        loadLoadingMessages();
    };

    // Function to hide the loading overlay with fade-out effect
    window.hideLoadingOverlay = function() {
        // Add the 'fade-out' class to trigger the CSS transition
        loadingOverlay.classList.add('fade-out');

        // After the transition duration, hide the overlay completely
        setTimeout(() => {
            loadingOverlay.style.display = "none";
        }, 1000); // Duration matches the CSS transition (1s)
    };

    // Function to show an error overlay with a message
    window.showErrorOverlay = function(message) {
        if (loadingMessageInterval) {
            clearInterval(loadingMessageInterval);
        }
        loadingMessageElement.innerText = message;
        loadingOverlay.style.backgroundColor = "#000";
        loadingOverlay.classList.remove('fade-out'); // Ensure it's visible
        loadingOverlay.style.display = "flex";
    };

    // Load loading messages initially
    loadLoadingMessages();
}
