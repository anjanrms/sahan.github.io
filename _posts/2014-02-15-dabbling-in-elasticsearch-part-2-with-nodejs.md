---
layout: post
title: "Dabbling in ElasticSearch - PART 2 - with NodeJS"
category: posts
---

<br>
This is a continuation of [Dabbling in ElasticSearch - PART 1](/posts/dabbling-in-elasticsearch-part-1-with-github-archive), where we create a minimal NodeJS application which uses the ElasticSearch (ES) [JavaScript client](http://www.elasticsearch.org/guide/en/elasticsearch/client/javascript-api/current/index.html). We'll be using [ExpressJS](http://expressjs.com) v3.4.8 with [JADE](http://jade-lang.com/) as the template engine, along with [morris.js](http://www.oesmith.co.uk/morris.js/) for a crude visualization of the data.   

To get started quickly, install express globally and generate a boilerplate.   

<pre class="terminal">
<c>npm</c> install -g express
<c>express</c> elasticnode
<c>cd</c> elasticnode
<c>npm</c> install
</pre>
> Run `node app.js` and make sure the app is available at [localhost:3000](http://localhost:3000/)   

<br>
Next, install ElasticSearch.js, verify this in *package.json* and edit the name as well.   

<pre class="terminal">
<c>npm install</c> --save elasticsearch
</pre>

<h6>package.json</h6>
{% highlight JSON %}
{
  "name": "ElasticNode",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "express": "3.4.8",
    "jade": "*",
    "elasticsearch": "~1.5.6"
  }
}
{% endhighlight %}

<br>
Let's display the percentage of push events by language, for popular repositories, whose commit message contains either the word *merge* or *merged*. Create a module named *esclient.js* within a *lib* directory inside your project root. This is where we'll connect to the local ES node and run queries on the index. It will export a simple function named *runFilteredQuery* which executes a filtered query based on the given parameters.   

<h6>lib/esclient.js</h6>
{% highlight JavaScript %}
"use strict";

var es = require('elasticsearch');
var client = new es.Client();
var index = 'github';
var type = '2014-02-02-14'; 

module.exports.runFilteredQuery = function(query, filter, size, from, callback) {

    client.search({
        index: index,
        type: type,
        size: size,
        from: from,
        body: {
            query: {
                filtered: {
                    query: query,
                    filter: filter
                }
            }
        }
    }, callback);
};
{% endhighlight %}

<br>
With `new es.Client()` you connect to `localhost:9200` with the default settings and receive a client interface which contains a `search()` function for executing queries. Note that the *body* property contains the same structure for the query which we've already posted in previous examples - which is a *query* object that wraps a *filtered* object containing the query and the filter. The size and from parameters are passed as separate properties along with the defined index and type.   

Create another module named *ghevents.js* which will use the *esclient* module to execute given queries with pre-defined filters. Let's define a filter named *stargazedPushesFilter* for push events associated with repositories which have a stargazer count of at least 500.   

<h6>lib/ghevents.js</h6>
{% highlight JavaScript %}
"use strict";

var es = require('./esclient');
var stargazedPushesFilter = {
  "and": {
      "filters" : [ 
          {
            "range" : { "stargazers" : { "gte" : 500 } }
          },
          {
            "term": { "type": "pushevent" }
          }
      ],
      "_cache" : true
  }
}
{% endhighlight %}

<br>
We create an [`and`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-and-filter.html) filter, with caching enabled, for a [`range`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-range-query.html) filter and a [`term`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-term-query.html) filter. Next, we export a function named *languageStats* which accepts a search context and runs a filtered query using the *esclient* module.   

<h6>lib/ghevents.js</h6>
{% highlight JavaScript %}
"use strict";

var es = require('./esclient');
var defaultSize = 100;
var stargazedPushesFilter = {
  "and": {
      "filters" : [ 
          {
            "range" : { "stargazers" : { "gte" : 500 } }
          },
          {
            "term": { "type": "pushevent" }
          }
      ],
      "_cache" : true
  }
}

module.exports.languageStats = function(search) {

  es.runFilteredQuery(
    search.query,
    stargazedPushesFilter,
    search.size? search.size :defaultSize,
    search.from? search.from :0,

    function(err, res) {
      if(err) {
        search.onFailure(err);
      }
      else {
        var stats = {};
        res.hits.hits.map(function(hit) {
            var lang = hit._source.repository.language;
            if(lang) {
                if(!stats[lang]) {
                    stats[lang] = [];
                }
                stats[lang].push(hit);
            }
        });
        search.onSuccess(stats);
      }
    }
  );
}
{% endhighlight %}

<br>
The default number of hits to return is defined as 100. The search context contains the query, along with callbacks to handle success and failure scenarios, and optional *size* and *from* parameters. If the query executed successfully, all the hits are grouped by the major language for the repository, else the error is forwarded.   

Next we define a route named `analytics.js` inside the *routes* folder which initiates the search and handles the result or failure.   

<h6>routes/analytics.js</h6>
{% highlight JavaScript %}
"use strict";

var ghevents = require('../lib/ghevents');

exports.languages = function(req, res) {

    var q = req.query.q;
    
    ghevents.languageStats({
      query: {
        "match": {
          "payload.shas": (q instanceof Array)? q.join(' ') :q
        }
      },
      onSuccess: function(result) {
        res.send(result); 
      },
      onFailure: function(error) {
        res.send({
          'Oops!':[1]
        });
      }
  });
};
{% endhighlight %}

<br>
The exported *languages* function looks for all request parameters named *q* and uses them in a [`match`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-match-query.html) query on the event payload. If the query executed successfully we respond with the result. Else we respond with a single language named Oops with a count of 1, to notify the failure without any extra effort.   

Once we've created the route, we can define it in `app.js`, start the express server and make sure that a [request to the route](http://localhost:3000/analytics/languages?q=merge&q=merged) responds with the data.   


<h6>app.js</h6>
{% highlight JavaScript %}
var express = require('express');
var routes = require('./routes');
var analytics = require('./routes/analytics');

...

app.get('/', routes.index);
app.get('/analytics/languages', analytics.languages);

...
{% endhighlight %}

<br>
<pre class="terminal">
<c>node</c> app
<c>curl</c> -XGET localhost:3000/analytics/languages?q=merge&q=merged
</pre>

<br>
To visualize this data, we use a donut chart created by [morris.js](http://www.oesmith.co.uk/morris.js/index.html). The first step is to add morris.js and it's dependencies to the `layout.jade` template.   

<h6>views/layout.jade</h6>
{% highlight CSS %}
doctype html
html
  head
    title= title
    link(rel='stylesheet', href='http://cdn.oesmith.co.uk/morris-0.4.3.min.css')
    link(rel='stylesheet', href='/stylesheets/style.css')
    script(src='http://ajax.googleapis.com/ajax/libs/jquery/1.9.0/jquery.min.js')
    script(src='http://cdnjs.cloudflare.com/ajax/libs/raphael/2.1.0/raphael-min.js')
    script(src='http://cdn.oesmith.co.uk/morris-0.4.3.min.js')
  body
    block content
{% endhighlight %}

<br>
We will also need to make a minor edit on `index.jade` to provide a container for the chart.   

<h6>views/index.jade</h6>
{% highlight CSS %}
extends layout

block content
  h4= title
  div#chart
{% endhighlight %}

<br>
Next, we create our frontend in a file named `chart.js` which invokes a request to our route and fetches the data. The arguments to the match query are sent in the query string. We'll be making use of jQuery since it was already added as a morris.js dependency.   

<h6>public/javascripts/chart.js</h6>
{% highlight JavaScript %}
$(document).ready(function() {
  $.getJSON('/analytics/languages?q=merge&q=merged', function(languages) {
      var data = [];
      var colors = [];
      
      for(var lang in languages) {
        if(languages.hasOwnProperty(lang)) {
          data.push({
            label: lang, 
            value: languages[lang].length
          });
          colors.push('#'+(Math.random().toString(16)).slice(2, 8));
        }
      }

      Morris.Donut({
        element: 'chart',
        data: data,
        colors: colors
      });
  });
});
{% endhighlight %}

<br>
For every hit in the result, we create an array of language names and colors. These are fed to a morris.js donut chart which identifies the id of the container in `index.jade`. We can add this to `layout.jade` and run the application to [visualize the data](http://localhost:3000).   

<h6>views/layout.jade</h6>
{% highlight CSS %}
doctype html
html
  head
    title= title
    link(rel='stylesheet', href='http://cdn.oesmith.co.uk/morris-0.4.3.min.css')
    link(rel='stylesheet', href='/stylesheets/style.css')
    script(src='http://ajax.googleapis.com/ajax/libs/jquery/1.9.0/jquery.min.js')
    script(src='http://cdnjs.cloudflare.com/ajax/libs/raphael/2.1.0/raphael-min.js')
    script(src='http://cdn.oesmith.co.uk/morris-0.4.3.min.js')
    script(src='/javascripts/chart.js')
  body
    block content
{% endhighlight %}

<br>
If you're tired of seeing *"express"* everywhere, make a slight edit to the index route and alter the title.   

<h6>routes/index.js</h6>
{% highlight JavaScript %}
exports.index = function(req, res){
  res.render('index', { title: 'ElasticNode' });
};
{% endhighlight %}

<br>
<pre class="terminal">
<c>node</c> app
</pre>

<br>
![Visualizing ES Results](/images/elasticnode.png "Visualizing ES Results")

<br>
I hope these two posts have peaked your interest in ElasticSearch. For more information head over to [elasticsearch.org/resources](http://www.elasticsearch.org/resources) or checkout the [MEAP chapters](http://www.manning.com/hinman) for ES In Action. You might also be interesting in reading the [case studies](http://www.elasticsearch.org/case-studies) to see how ES is being used by some famous companies.   
