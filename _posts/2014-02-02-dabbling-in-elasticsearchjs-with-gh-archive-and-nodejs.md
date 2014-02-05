---
layout: post
title: "Dabbling in ElasticSearch(.js) with GH-Archive and NodeJS"
category: posts
---

<br>
So I've been experimenting with [ElasticSearch](http://elasticsearch.org) (ES) which seems to excel at performing full-text searches on JSON documents over a RESTful API. It's powered by [Apache Lucene](http://lucene.apache.org/) and offers real-time indexing and searching with a slick Query DSL. Let's give it a spin.   

I'll be using [v0.90.10](http://www.elasticsearch.org/download/) with data from the [GitHub-Archive](http://githubarchive.org) to create an index of GitHub events and run some searches using the query DSL (on Linux). Next, we'll see how this works with the JavaScript API using a minimal NodeJS application.   

<br>
Download the distribution from [elasticsearch.org](http://www.elasticsearch.org/download) and extract it. Move into to the bin directory and run **elasticsearch** with the **-f** option.   

<pre class="terminal">
<c>wget</c> https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-0.90.10.tar.gz

<c>tar -zxf</c> elasticsearch-0.90.10.tar.gz

<c>cd</c> elasticsearch-0.90.10/bin

<c>./</c>elasticsearch -f
</pre>
> ES is written [entirely in Java](https://github.com/elasticsearch/elasticsearch) and requires a Java runtime with the JAVA_HOME environment variable pointing to it.   

<br>
This will start a single server node on [localhost:9200](http://localhost:9200) which we can confirm with a **GET** request.   

<pre class="terminal">
<c>curl -XGET</c> localhost:9200

{
  "ok" : true,
  "status" : 200,
  "name" : "Banner, Betty Ross",
  "version" : {
    "number" : "0.90.10",
    "build_hash" : "0a5781f44876e8d1c30b6360628d59cb2a7a2bbb",
    "build_timestamp" : "2014-01-10T10:18:37Z",
    "build_snapshot" : false,
    "lucene_version" : "4.6"
  },
  "tagline" : "You Know, for Search"
}
</pre>
> If you started ES in the background (without -f) use `curl -XPOST localhost:9200/_cluster/nodes/_local/_shutdown` to shutdown the node.   

<br>
In ES lingo, a **node** is a live ES server instance with possibly multiple indices. An **index** contains JSON **documents** of different types, where one **type** shares the same *schema*. Nodes that share the same indices belong to a single **cluster**. To get a feel of how you can work with the [RESTful API](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/docs.html), let's create an index and insert some documents to read, update and delete them.   

<br>
<h5>Dash through the single document API</h5>
<br>

I'm going to create some of my favorite Marvel characters in an index called **marvel**. I can create this index [manually](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/indices-create-index.html) with `curl -XPUT localhost:9200/marvel` or I could let ES create it for me by indexing a document right away.   

<pre class="terminal">
<c>curl -XPUT</c> localhost:9200/marvel/mutant/rogue -d'{

"name":"Anna Marie",
"gender":"female",
"abilities":["lifeforce siphoning", "power mimicry"]

}'

{"ok":true,"_index":"marvel","_type":"mutant","_id":"rogue","_version":1}
</pre>
> You can check out the chrome extension [Sense](https://github.com/bleskes/sense) to help you with these commands.   


<br>
This will create a **type** called **mutant** containing a single document with **rogue** as the **id**.  We can **read** this by issuing a **GET** request.    

<pre class="terminal">
<c>curl -XGET</c> localhost:9200/marvel/mutant/rogue

{"_index":"marvel","_type":"mutant","_id":"rogue","_version":1,"exists":true, "_source" : {

"name":"Anna Marie",
"gender":"female",
"abilities":["lifeforce siphoning", "power mimicry"]

}}
</pre>
> Issue this request with the `pretty` query parameter to pretty-print the JSON output, e.g. `curl -XGET localhost:9200/marvel/mutant/rogue?pretty`   

<br>
We can **update** this document with a **POST** or **PUT** request by identifying it with the same id.

<pre class="terminal">
<c>curl -XPOST</c> localhost:9200/marvel/mutant/rogue -d'{

"name":"Anna Marie",
"gender":"female",
"abilities":["lifeforce siphoning", "power mimicry"],
"teams":["X-Men", "X.S.E.", "Brotherhood of Mutants"]

}'

{"ok":true,"_index":"marvel","_type":"mutant","_id":"rogue","_version":2}
</pre>
> Notice that the version has been incremented.   

<br>
We could **delete** this document by issuing a **DELETE** request and a subsequent **GET** request will confirm that the document will not exist.   

<pre class="terminal">
<c>curl -XDELETE</c> localhost:9200/marvel/mutant/rogue

{"ok":true,"found":true,"_index":"marvel","_type":"mutant","_id":"rogue","_version":3}

<c>curl -XGET</c> localhost:9200/marvel/mutant/rogue?pretty

{
  "_index" : "marvel",
  "_type" : "mutant",
  "_id" : "rogue",
  "exists" : false
}
</pre>

<br>
...and if I wanted to save [Vision](http://marvel.com/characters/bio/1009697/vision), who's an android, I'd create a new type called **android** and insert him there instead.   

<pre class="terminal">
<c>curl -XPUT</c> localhost:9200/marvel/android/vision -d'{

"name":"Vision",
"gender":"male",
"abilities":["density control", "energy projection"]

}'

{"ok":true,"_index":"marvel","_type":"android","_id":"vision","_version":1}
</pre>

<br>
Next, we'll create an index of GitHub events typed under each day using data from the [GitHub Archive](http://www.githubarchive.org).

<br>
<h5>Indexing GitHub Timeline Archives</h5>
<br>

[GitHub Archive](http://www.githubarchive.org) collects all public event data for each hour and makes them available for further analysis. We'll use such an archive to create an index of GitHub events for a certain hour in a particular day. The first step would be to download and extract an archive of your choice.   

<pre class="terminal">
<c>wget</c> http://data.githubarchive.org/2014-02-02-14.json.gz

<c>gunzip</c> 2014-02-02-14.json.gz
</pre>
> Archived public events for the 2nd of February, 2014 at 2:00 PM UTC.   

<br>
This gives you the file `2014-02-02-14.json` which is a hefty 3.4 MB and lists 12,810 JSON objects (i.e. our documents) line-by-line. Note that this is not a properly structured JSON array - which, as you will realize shortly, is to our advantage. Now that we have the data, I'd like to keep it in an index named **github** under the type **2014-02-02-14**. So how would one go about indexing 12,810 documents? By using the [Bulk API](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/docs-bulk.html). 

The actions **index**, **create**, **delete** and **update** (since v0.90.1) can be performed in bulk against the endpoint `localhost:9200/_bulk`. This endpoint accepts data in the following format, where each line specifies an action (along with the metadata - index, type, id) followed by another optional line containing a JSON document (e.g. for a create action).   

<pre>
<font color="#0C7EA1">action
[document]</font>
<font color="#585858">action
[document]</font>
...
</pre>
> The JSON document should not be pretty-printed and should occupy just one line.   

<br>
For a bulk index operation on the documents, the event data should assume the following format.   

<pre>
<font color="#0C7EA1">{ "index" : { "_index" : "github", "_type" : "2014-02-02-14", "_id" : "1" } }
{"created_at":"2014-02-02T14:03:23-08:00", ...}</font>
<font color="#585858">{ "index" : { "_index" : "github", "_type" : "2014-02-02-14", "_id" : "2" } }
{"created_at":"2014-02-02T14:03:23-08:00", ...}</font>
...
</pre>
> An indexing action on every document, with the line number being assigned as the id.   

<br>
We can use [awk](http://www.hcs.harvard.edu/~dholland/computers/awk.html) to make this transformation and post the data to the bulk endpoint.   

<pre class="terminal">
<c>awk</c> '{print "{\"index\":{\"_index\":\"github\",\"_type\":\"2014-02-02-14\",\"_id\":\""NR"\"}}" }1' 2014-02-02-14.json > index.json

<c>curl -s -XPOST</c> localhost:9200/_bulk --data-binary @index.json
</pre>
> You might even use the endpoints `localhost:9200/github/_bulk` or `localhost:9200/github/2014-02-02-14/_bulk` in which case the index and/or type can be skipped from the individual actions.

<br>
<br>
`to be continued...`
<br>
<br>