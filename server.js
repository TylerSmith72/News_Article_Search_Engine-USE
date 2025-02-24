const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

// Increase the limit for the request body
app.use(bodyParser.json({ limit: '200mb' }));
app.use(bodyParser.urlencoded({ limit: '200mb', extended: true }));

// Middleware to serve static files like HTML, CSS, JS
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON bodies
app.use(express.json());

// Endpoint to fetch the list of datasets
app.get('/api/datasets', (req, res) => {
    const articlesDir = path.join(__dirname, 'Articles');
    fs.readdir(articlesDir, (err, files) => {
        if (err) {
            console.error("Error reading the articles directory:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        const datasets = files.filter(file => file.endsWith('.json'));
        res.json(datasets);
    });
});

// Endpoint to fetch article titles from a JSON file
app.get('/api/titles', (req, res) => {
    const dataset = decodeURIComponent(req.query.dataset);
    const filePath = path.join(__dirname, 'Articles', dataset);
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading the articles file:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        
        try {
            const articlesArray = JSON.parse(data);
            res.json(articlesArray);
        } catch (error) {
            console.error("Error parsing articles file:", error);
            res.status(500).json({ message: "Error parsing articles" });
        }
    });
});

// Endpoint to save embeddings to a file
app.post('/api/save-embeddings', (req, res) => {
    const { embeddings, dataset } = req.body;
    const filePath = path.join(__dirname, `Embeddings`, `embeddings_${decodeURIComponent(dataset)}`);

    fs.writeFile(filePath, JSON.stringify(embeddings), 'utf8', (err) => {
        if (err) {
            console.error("Error saving embeddings:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        res.status(200).json({ message: "Embeddings saved successfully" });
    });
});

// Endpoint to load embeddings from a file
app.get('/api/load-embeddings', (req, res) => {
    const dataset = decodeURIComponent(req.query.dataset);
    const filePath = path.join(__dirname, `Embeddings`, `embeddings_${dataset}`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error loading embeddings:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        if (!data) {
            console.error("Embeddings file is empty");
            return res.status(200).json([]);
        }
        try {
            const embeddings = JSON.parse(data);
            res.status(200).json(embeddings);
        } catch (error) {
            console.error("Error parsing embeddings file:", error);
            res.status(500).json({ message: "Error parsing embeddings" });
        }
    });
});

// Serve index.html for the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
