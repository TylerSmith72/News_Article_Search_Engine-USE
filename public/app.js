let currentlyOpenArticle = null;

// Function to calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// Function to rank articles based on similarity scores
function rankArticles(titles, similarities) {
    return similarities.map((similarity, index) => ({
        title: titles[index],
        similarity: similarity.similarity
    })).sort((a, b) => b.similarity - a.similarity);
}

function displayStatus(message) {
    const statusDiv = document.getElementById("content");
    statusDiv.innerHTML = `<p class='status-message'>${message}</p>`;
}

function toggleAccordion(element, index) {
    const content = element.nextElementSibling;

    if (content.style.display === "block") {
        content.style.display = "none";
        currentlyOpenArticle = null;
    } else {
        if (currentlyOpenArticle) {
            currentlyOpenArticle.style.display = "none";
        }

        content.style.display = "block";
        currentlyOpenArticle = content;
        const articleElement = document.getElementById(`article-${index}`);
        articleElement.scrollIntoView({ behavior: 'smooth' });
    }
}

async function fetchArticles(dataset) {
    try {
        const response = await fetch(`/api/titles?dataset=${encodeURIComponent(dataset)}`);
        const articles = await response.json();
        return articles;
    } catch (error) {
        console.error("Error fetching articles:", error);
        alert("Error fetching article data.");
        return [];
    }
}

async function loadEmbeddings(dataset) {
    try {
        const response = await fetch(`/api/load-embeddings?dataset=${dataset}`);
        const embeddings = await response.json();
        return embeddings;
    } catch (error) {
        console.error("Error loading embeddings:", error);
        return [];
    }
}

async function saveEmbeddings(embeddings, dataset) {
    try {
        const response = await fetch('/api/save-embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ embeddings, dataset })
        });
        const result = await response.json();
        console.log(result.message);
    } catch (error) {
        console.error("Error saving embeddings:", error);
    }
}

let currentPage = 1; // Tracks the current page
const articlesPerPage = 20; // Number of articles per page
let rankedArticles = []; // Store ranked articles globally for pagination

function renderArticles(page = 1) {
    const outputDiv = document.getElementById("content");
    outputDiv.innerHTML = "<h3>Ranked Articles and Similarity Scores:</h3>";

    const startIndex = (page - 1) * articlesPerPage;
    const endIndex = startIndex + articlesPerPage;
    const articlesToDisplay = rankedArticles.slice(startIndex, endIndex);

    articlesToDisplay.forEach((item, index) => {
        if (item.similarity !== undefined) {
            const creators = Array.isArray(item.article.creator) ? item.article.creator : [];
            const creatorText = creators.length > 0 ? creators.join(', ') : 'Unknown Creator';
            const imageUrl = item.article.image_url && item.article.image_url.startsWith("http") ? item.article.image_url : '';
            outputDiv.innerHTML += 
                    `<div class='article' id='article-${index}'>
                        <div class='article-header' onclick='toggleAccordion(this, ${index})'>
                            <div class='title'><strong>${item.article.title}</strong></div>
                            <div class='similarity'><strong>Similarity: ${item.similarity.toFixed(4)}</strong></div>
                        </div>

                        <div class='article-content'>
                            <hr>
                            ${imageUrl ? `<img src="${imageUrl}" alt="Article Image"/>` : ''}
                            <p><strong>Description:</strong> ${item.article.description}</p>
                            <p><strong>Creator:</strong> ${creatorText}</p>
                            <p><strong>Published:</strong> ${new Date(item.article.pubDate).toLocaleDateString()}</p>
                            <p><a href="${item.article.link}" target="_blank">Read More</a></p>
                        </div>
                    </div>`
                ;
        }
    });
    // Pagination controls and page numbers
    const totalPages = Math.ceil(rankedArticles.length / articlesPerPage);
    outputDiv.innerHTML += `
        <div style="text-align: center; margin-top: 20px;">
            <p>Page ${page} of ${totalPages}</p>
            ${page > 1 ? `<button onclick="changePage(${page - 1})">Previous</button>` : ''}
            ${page < totalPages ? `<button onclick="changePage(${page + 1})">Next</button>` : ''}
        </div>`;
}

function changePage(newPage) {
    currentPage = newPage;
    renderArticles(currentPage);
}

async function fetchDatasets() {
    try {
        const response = await fetch('/api/datasets');
        const datasets = await response.json();
        const datasetSelect = document.getElementById("datasetSelect");

        datasets.forEach(dataset => {
            const option = document.createElement("option");
            option.value = dataset;
            option.text = dataset.replace(/_/g, ' ').replace('.json', '');
            datasetSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error fetching datasets:", error);
    }
}

async function processQuery() {
    const query = document.getElementById("queryInput").value;
    const dataset = document.getElementById("datasetSelect").value;

    if (!query) {
        alert("Please enter a query.");
        return;
    }

    // Setting up TensorFlow
    if (tf.getBackend() !== 'webgl') {
        await tf.setBackend('webgl');
    }
    await tf.ready();
    console.log("Backend set to:", tf.getBackend());
    displayStatus("Backend set to: " + tf.getBackend());

    displayStatus("Loading Model...");
    const model = await use.load();
    console.log("Model Loaded: ", model);
    displayStatus("Model Loaded!");

    // Setting up Articles
    const originalArticles = await fetchArticles(dataset);
    if (!Array.isArray(originalArticles)) {
        alert("Failed to fetch articles.");
        return;
    }
    if (originalArticles.length === 0) {
        alert("No articles available for processing.");
        return;
    }

    displayStatus("Converting titles to lowercase...");
    const lowercaseTitles = originalArticles.map(article => article.title.toLowerCase());

    const batchSize = 100;
    const similarities = [];
    let queryEmbeddingArray;
    const maxConcurrentBatches = 1;

    // Load previously saved embeddings
    displayStatus("Checking for saved Embeddings...");
    const savedEmbeddings = await loadEmbeddings(dataset);
    let articleEmbeddingsArray = [];

    if (savedEmbeddings.length > 0) {
        console.log("Loaded saved embeddings:", savedEmbeddings);
        displayStatus("Loaded Saved Embeddings!");
        articleEmbeddingsArray = savedEmbeddings;
    } else {
        console.log("No saved embeddings found. Processing from scratch...");
        displayStatus("No Saved Embeddings Found. Processing from Scratch...");

        try {
            const processBatch = async (batchTitles, batchIndex) => {
                const articleEmbeddings = await model.embed(batchTitles); // Embed the batch of titles
                const batchEmbeddingsArray = await articleEmbeddings.array();
                
                articleEmbeddingsArray.push(...batchEmbeddingsArray);
                tf.dispose(articleEmbeddings);

                console.log(`Processed batch ${batchIndex + 1} (Size: ${batchTitles.length}) out of ${Math.ceil(lowercaseTitles.length / batchSize)}`);
                displayStatus(`Processed batch ${batchIndex + 1} (Size: ${batchTitles.length}) out of ${Math.ceil(lowercaseTitles.length / batchSize)}`);
            };

            const batchPromises = [];
            displayStatus("No Embeddings Found, Processing batches...");

            for (let i = 0; i < lowercaseTitles.length; i += batchSize) {
                const batchTitles = lowercaseTitles.slice(i, i + batchSize);
                const batchIndex = Math.floor(i / batchSize);

                batchPromises.push(processBatch(batchTitles, batchIndex));

                if (batchPromises.length >= maxConcurrentBatches) {
                    await Promise.all(batchPromises);
                    batchPromises.length = 0; // Clear the array for the next set of batches
                }
            }

            displayStatus("Processing last batch...");
            await Promise.all(batchPromises);
            displayStatus("Processing complete!");

            // Save embeddings after processing
            displayStatus("Saving Embeddings...");
            await saveEmbeddings(articleEmbeddingsArray, dataset);
        } catch (error) {
            console.error("Error processing batches:", error);
            alert("Error processing embeddings.");
            return;
        }
    }

    try {
        const queryEmbedding = await model.embed([query.toLowerCase()]);
        queryEmbeddingArray = await queryEmbedding.array();
        tf.dispose(queryEmbedding); // Dispose of the tensor after converting to array
        console.log("Processing query:", query);
        displayStatus("Processing Query...");

        originalArticles.forEach((article, index) => {
            const similarity = cosineSimilarity(queryEmbeddingArray[0], articleEmbeddingsArray[index]);
            similarities.push({ article, similarity });
        });

        displayStatus("Ranking articles")
        rankedArticles = similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 500); // Only the top 500 articles

        renderArticles(); // Render the first page
    }catch(error){
        console.log("Error processing query",error);
        alert("Error processing query");
    }
}

document.addEventListener("DOMContentLoaded",fetchDatasets);
displayStatus("Enter a query and select a dataset to begin!");
