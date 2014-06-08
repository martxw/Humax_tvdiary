/*
 * TV Diary main display page scripts.
 * Author: Martin Wink, 2013-2014.
 */

// The main page itself is rendered after accessing the DB to initialize the following global variables:
//  day_start seconds offset to the start of the TV day. Relative to local time.
//  min_time time of the earliest available information. In UTC.
//  max_time time of the latest available information. In UTC.
//  monthly_summary_enabled is a 1/0 functionality flag.
//  watchlist_enabled is a 1/0 functionality flag.
//  inventory_enabled is a 1/0 functionality flag.
//  snapshot_time defined only for a published snapshot.
//

// Declare globals

// Today's calendar date start.
var today_start;

// Whether live broadcasts are to be displayed. Toggled on and off.
var including_live = true;

// Whether particular event classes are visible or not.
// NB Object 'cos JS arrays are not associative arrays.
var events_visible = {
  ".live_event": true,
  ".watch_scheduled": true, ".watch_crid_repeat": true, ".watch_dejavu_repeat": true,
  ".dwatch_scheduled": false, ".dwatch_crid_repeat": false, ".dwatch_dejavu_repeat": false};

// Start time for the displayed details, with the day_start offset included. Changed by the datepicker. In UTC.
var daily_start_time;

// Year and month selectors for the monthly summary.
var monthly_year;
var monthly_month;
var monthly_initialized = false;

// Watchlist modification time for optimization.
var watchlist_modified = 0;

// Inventory modification time for optimization.
var inventory_modified = 0;

// While awaiting Ajax responses.
var isBusyR = false;
var isBusyW = false;
var isBusyWl = false;
var isBusyM = false;
var isBusyS = false;

// For selecting tabs.
var tabIndex_daily = 0;
var tabIndex_monthly = 1;
var tabIndex_search = 2;
var tabIndex_watchlist = 3;
var tabIndex_inventory = 4;

// Monthly summary table sorting order.
var programs_sorting = [[1,0],[2,0]];
var channels_sorting = [[1,0]];

// One table shows both history and epgsearch results - which?
var showingHistoryResults = true;

// Search results table.
var history_sorting = [[4, 1]];
var epgsearch_sorting = [[4, 1]];

// Watchlist results table.
var watchlist_sorting = [[3, 1]];

//////
// Logging wrapper.
//////
function log_stuff(x) {
  /* console.log(x); */
  /*$.get("/tvdiary/jslog.jim?msg=" + encodeURIComponent(x));*/
}

//////
// Page loaded - start work.
//////
$(document).ready(function() {
  loadCookies();

  if (typeof snapshot_time == "undefined") {
    today_start = get_tv_day_start(new Date().getTime() / 1000, false);
  } else {
    today_start = get_tv_day_start(snapshot_time, false);
  }

  // Initialize the to-top scroller.
  $().UItoTop({easingType: 'easeOutQuart'});
  $('.backtotop').click(function() {
    $('html, body').animate({scrollTop: 0}, 500);
  });

  // Initialize the tabs.
  $( "#tvd_tabs" ).tabs({
    heightStyle: "auto",
    activate: function( event, ui ) {
      switch (ui.oldTab.index()) {
        case tabIndex_daily:
          $("#daily_panel").hide();
          break;

        case tabIndex_monthly:
          $("#monthly_panel").hide();
          break;

        case tabIndex_search:
          $("#search_panel").hide();
          break;

        case tabIndex_watchlist:
          $("#watchlist_panel").hide();
          break;

        case tabIndex_inventory:
          $("#inventory_panel").hide();
          $('#inventory_spinner').show();
          break;

        default:
          break;
      }
      switch (ui.newTab.index()) {
        case tabIndex_daily:
          $("#daily_panel").show("fade");
          break;

        case tabIndex_monthly:
          $("#monthly_panel").show("fade");
          if (!monthly_initialized) {
            monthly_initialized = true;
            $('#monthly_month_selector').val( monthly_year * 100 + monthly_month );
            update_monthly(monthly_year, monthly_month);
          }
          break;

        case tabIndex_search:
          $("#search_panel").show("fade");
          break;

        case tabIndex_watchlist:
          $("#watchlist_panel").show("fade");
          update_watchlist();
          break;

        case tabIndex_inventory:
          $("#inventory_panel").show("fade");
          update_inventory();
          break;

        default:
          break;
      }
    }
  });
  $("#daily_panel").show();
  $("#monthly_panel").hide();
  $("#search_panel").hide();
  $("#watchlist_panel").hide();
  $("#inventory_panel").hide();

  if (!monthly_summary_enabled) {
    $( "li:has([href='#monthly_tab'])" ).hide();
  }
  if (!watchlist_enabled) {
    $( "li:has([href='#watchlist_tab'])" ).hide();
  }
  if (!inventory_enabled) {
    $( "li:has([href='#inventory_tab'])" ).hide();
  }

  //////
  // Initialize the daily panel.
  //////

  // Initialize the daily datepicker.
  $('#daily_datepicker').datepicker({
    firstDay: 1,
    dateFormat: '@',  //@=ms since 01/01/1970.
    minDate: new Date(min_time * 1000),
    maxDate: new Date(max_time * 1000),
    defaultDate: new Date(today_start * 1000),
    onSelect: function(val, inst) {
      if (isBusyR || isBusyW) {
        log_stuff("UI is busy - not changing the date to " + new Date(Number(val)) + " - restoring " + new Date(daily_start_time*1000) +".");
        $('#daily_datepicker').datepicker("setDate", new Date(daily_start_time * 1000));
      } else {
        // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
        log_stuff("datepicker.onSelect(" + new Date(Number(val)) + ")");
        var chosen = get_tv_day_start(Number(val) / 1000, true);
        update_daily(chosen);
      }
    }
  });
  log_stuff("Initialized the default datepicker time to " + new Date(today_start * 1000));

  $('#daily_prev_day').button()
    .click(function() {
      updateDate(-1);
    });
  $('#daily_today').button()
    .click(function() {
      updateDate(0);
    });
  $('#daily_next_day').button()
    .click(function() {
      updateDate(+1);
    });

  if (!watchlist_enabled) {
    $('#daily_watchlist_outer').hide();
  }

  //////
  // Initialize the monthly summary panel.
  //////

  // Initialize the months selector
  {
    var monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];
    var minDate =  new Date(min_time * 1000);
    var maxDate = new Date(today_start * 1000);
    var y = minDate.getFullYear();
    var m = minDate.getMonth();
    var maxY = maxDate.getFullYear();
    var maxM = maxDate.getMonth();
    var optionsHtml = "";
    while (y <= maxY) {
      while (m < 12) {
        var val = y * 100 + m + 1;
        optionsHtml += "<option value=\"" + val + "\">" + monthNames[m] + " " + y + "</option>";
        m += 1;
        if (y == maxY && m > maxM) {
          break;
        }
      }
      y += 1;
      m = 0;
    }
    $('#monthly_month_selector').html(optionsHtml);
    monthly_year = maxY;
    monthly_month = maxM + 1;
    $('#monthly_month_selector').on('change', function() {
      var y = (($(this).val() / 100) | 0);
      var m = (($(this).val() % 100) | 0);
      log_stuff("Selected month " + y + " " + m + ".");
      if (isBusyM) {
        log_stuff("UI is busy - not changing the date. Disabling the field must have failed.");
      } else {
        update_monthly(y, m);
      }
    });
  }

  //
  // For durations, sort on the raw number of minutes set in the "sval" attribute.
  //
  var sortValueTextExtraction = function(node) 
  {
    var sval = node.getAttribute("sval");
    if (sval != null) {
      return sval;
    } else {
      return node.innerText;
    }
  }

  $("#monthly_programs_table").tablesorter({
    textExtraction: sortValueTextExtraction,
    headers: {
      0: {
        sorter: false 
      }
    },
    sortInitialOrder: "desc"
  }).bind("sortEnd",function() {
      programs_sorting = this.config.sortList;
      saveCookies();
      apply_altrow($('#monthly_programs_table'));
  });
  $("#monthly_channels_table").tablesorter({
    textExtraction: sortValueTextExtraction,
    headers: {
      0: {
        sorter: false 
      }
    },
    sortInitialOrder: "desc"
  }).bind("sortEnd",function() { 
      channels_sorting = this.config.sortList;
      saveCookies();
      apply_altrow($('#monthly_channels_table'));
  });

  $('#monthly_prev').button()
    .click(function() {
      updateMonth(-1);
    });
  $('#monthly_latest').button()
    .click(function() {
      updateMonth(0);
    });
  $('#monthly_next').button()
    .click(function() {
      updateMonth(+1);
    });

  ///////////////
  // Initialize the history panel.
  ///////////////
  $('#search_results_spinner').hide();
  $('#search_results_footer').html("<span class=\"nothing\">Not yet searched</span>");

    var optionsHtml = "";
    optionsHtml += "<option value=\"E\">equals</option>";
    optionsHtml += "<option value=\"C\" selected>contains</option>";
    optionsHtml += "<option value=\"S\">begins</option>";
    optionsHtml += "<option value=\"F\">ends</option>";
    optionsHtml += "<option value=\"M\">matches</option>";
    
    $('#search_criteria_op_title').html(optionsHtml);
    $('#search_criteria_op_synopsis').html(optionsHtml);
    $('#search_criteria_op_channel').html(optionsHtml);

  $("#search_results_table").tablesorter({
    textExtraction: sortValueTextExtraction,
    headers: {
      0: {
        sorter: false 
      },
      6: {
        sorter: false 
      }
    },
    sortInitialOrder: "desc"
  }).bind("sortEnd",function() {
      if (showingHistoryResults) {
        history_sorting = this.config.sortList;
      } else {
        epgsearch_sorting = this.config.sortList;
      }
      saveCookies();
      apply_altrow($('#search_results_table'));
  });

  $('#search_diary_button').button().click(function() {
    searchHistory();
  });
  $('#search_epg_button').button().click(function() {
    searchEpg();
  });


  ///////////////
  // Initialize the watchlist panel.
  ///////////////
  $('#watchlist_results_spinner').hide();
  $('#watchlist_results_footer').html("<span class=\"nothing\">No results</span>");

  $("#watchlist_results_table").tablesorter({
    textExtraction: sortValueTextExtraction,
    headers: {
      5: {
        sorter: false 
      }
    },
    sortInitialOrder: "desc"
  }).bind("sortEnd",function() {
      watchlist_sorting = this.config.sortList;
      saveCookies();
      apply_altrow($('#watchlist_results_table'));
  });

  $('#watchlist_modify_button').button().click(function() {
    start_editing_watchlist();
  });
  $('#watchlist_save_button').button().click(function() {
    finish_editing_watchlist();
  });
  $('#watchlist_cancel_button').button().click(function() {
    $("#watchlist_specification").slideToggle('slow');
    $('#watchlist_modify_button').show();
  });

  $("#watchlist_specification").hide();
  $("#watchlist_modify_spinner").hide();


  ///////////////
  // Common code.
  ///////////////

  //////
  // Round the given time to the start of the TV day. The input andoutput times are UTC epoch values.
  // Since the start of TV day is in the local time, convert from UTC first, and restore to UTC after rounding.
  // If the input time's granularity includes the current time of day, then we need to *subtract* the day_start
  // before rounding down to the start of the day, so that between midnight and the start of the TV day we round
  // to the previous day. E.g. at 1am Tuesday we display Monday's TV schedule.
  // The granularity is date only for values from the datepicker because it returns midnight local time in UTC.
  //////
  function get_tv_day_start(t, date_only) {
    var d = new Date(Math.floor(t) * 1000);
    return Math.floor((((d.getTime() - d.getTimezoneOffset() * 60000) / 1000.0) - (date_only ? 0 : day_start)) / 86400) * 86400 + (day_start + d.getTimezoneOffset() * 60);
  }

  //
  // Round a duration from seconds to minutes.
  //
  function duration_seconds_to_minutes(d) {
    return Math.round(d / 60);
  }

  //////
  // Format an integer like "04".  
  //////
  function two_digits(num) {
    var ret = String(num);
    if (ret.length < 2) {ret = "0" + ret;}
    return ret;
  }

  //////
  // Format a duration as hours:minutes like "2:04"
  //////
  function format_duration(duration) {
    return Math.floor(duration / 60) + ":" + two_digits(duration % 60);
  }

  //////
  // Format the date like "Sat 7 Dec 2013"
  //////
  function formatDate(t) {
    var d = new Date(t * 1000);
    return $.datepicker.formatDate("D d M yy", d);
  }
  
  //////
  // Format the time like "2:04"
  //////
  function formatTime(t) {
    var d = new Date(t * 1000);
    return d.getHours() + ":" + two_digits(d.getMinutes());
  }
  
  //////
  // Format the date and time like "Sat 7 Dec 2013 2:04"
  //////
  function formatDateTime(t) {
    var d = new Date(t * 1000);
    return $.datepicker.formatDate("D d M yy ", d) + d.getHours() + ":" + two_digits(d.getMinutes());
  }
  
  //////
  // Format the date like "27/01"
  //////
  function formatVShortDate(t) {
    var d = new Date(t * 1000);
    return $.datepicker.formatDate("dd/mm ", d);
  }
  
  //////
  // Escape HTML-specific characters in a string
  //////
  var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
  };
  function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }

  //////
  // Load cookie values en mass.
  //////
  function loadCookies() {
    // Load the cookie.
    var cookie = getCookie("tvdiary_ui");
    if (cookie) {
      var parts = cookie.split("|");
      if (parts.length >= 1) {
        // Hide all, show the named ones only.
        for (key in events_visible) {
          events_visible[key] = false;
        }
        var visibility = parts[0].split(",");
        for (var i = 0, len = visibility.length; i < len; i++) {
          if (visibility[i] != "false" && visibility[i] != "") {
            events_visible[visibility[i]] = true;
          }
        }
      }
      if (parts.length >= 2) {
        programs_sorting = parse2x(parts[1]);
      }
      if (parts.length >= 3) {
        channels_sorting = parse2x(parts[2]);
      }
      if (parts.length >= 4) {
        history_sorting = parse2x(parts[3]);
      }
      if (parts.length >= 5) {
        epgsearch_sorting = parse2x(parts[4]);
      }
      if (parts.length >= 6) {
        watchlist_sorting = parse2x(parts[5]);
      }
    }
  }
  function parse2x(valStr) {
    var vals = valStr.split(",");
    var len = vals.length / 2;
    var result = new Array();
    for (var i = 0; i < len; i++) {
      result[i] = new Array();
      result[i][0] = parseInt(vals[i * 2]);
      result[i][1] = parseInt(vals[i * 2 + 1]);
    }
    return result;
  }

  //////
  // Save the cookie values en mass.
  //////
  function saveCookies() {
    var visibility = "";
    for (key in events_visible) {
      if (events_visible[key]) {
        if (visibility != "") {
          visibility += ",";
        }
        visibility += key;
      }
    }
    var cookie = visibility + "|";
    cookie += fmt2x(programs_sorting) + "|"; // [[1,0],[2,0]];
    cookie += fmt2x(channels_sorting) + "|"; // [[1,0]];
    cookie += fmt2x(history_sorting) + "|"; // [[4, 1]];
    cookie += fmt2x(epgsearch_sorting) + "|"; // [[4, 1]];
    cookie += fmt2x(watchlist_sorting); // [[3, 1]];
    setCookie("tvdiary_ui", cookie);
  }
  function fmt2x(a) {
    var result = "";
    for (var i = 0; i < a.length; i++) {
      if (i > 0) {
        result += ",";
      }
      result += a[i][0] + "," + a[i][1];
    }
    return result;
  }

  //////
  // Save a cookie for a year.
  //////
  function setCookie(c_name, value) {
    var exdate = new Date();
    exdate.setDate(exdate.getDate() + 365);
    var c_value = escape(value) + "; expires=" + exdate.toUTCString();
    document.cookie = c_name + "=" + c_value;
  }

  //////
  // Read a cookie. Returns a string.
  //////
  function getCookie(c_name) {
    var c_value = document.cookie;
    var c_start = c_value.indexOf(" " + c_name + "=");
    if (c_start == -1) {
      c_start = c_value.indexOf(c_name + "=");
    }
    if (c_start == -1) {
      c_value = null;
    } else {
      c_start = c_value.indexOf("=", c_start) + 1;
      var c_end = c_value.indexOf(";", c_start);
      if (c_end == -1) {
        c_end = c_value.length;
      }
      c_value = unescape(c_value.substring(c_start,c_end));
    }
    return c_value;
  }

  //////
  // Update the alternating colour of rows beneath element "el", taking visibility into account.
  //////
  function apply_altrow(el) {
    var row = ($("thead", el).length > 0 ? 1 : 0);
    $("tr.event_row.visible_event", el).each(function(i, tr) {
      if (row % 2) {
        $(tr).addClass('odd').removeClass('even');
      } else {
        $(tr).addClass('even').removeClass('odd');
      }
      row += 1;
    });
  }
  
  //////
  // Bind click handler to all deja vu links.
  //////
  function bind_dejavu(el) {
    $('a.dejavu', el).click(function(e) {
      e.preventDefault();

      var prog_id = $(this).attr('prog_id');
      update_history_program(prog_id);
      $("#tvd_tabs").tabs( "option", "active", tabIndex_search );
    });
  }

  //////
  // Bind click handler to all crid repeats links.
  //////
  function bind_crid_repeats(el) {
    $('a.repeat', el).click(function(e) {
      e.preventDefault();

      var crid = $(this).attr('prog_crid');
      update_history_crid(crid);
      $("#tvd_tabs").tabs( "option", "active", tabIndex_search );
    });
  }

  //////
  // Bind click handler to all inventory links.
  //////
  function bind_inventory(el) {
    $('a.inventory', el).click(function(e) {
      e.preventDefault();

      $("#tvd_tabs").tabs( "option", "active", tabIndex_inventory );
    });
  }

  //////
  // Bind click handler to caption counts.
  //////
  function bind_caption_counts(el_caption, el_table, el_footer, empty_message) {
    $('.caption_count', el_caption).click(function(e) {
      e.preventDefault();

      var toggle_class = this.getAttribute("toggle");
      update_event_visibility(toggle_class, el_table, this, !events_visible[toggle_class]);

      if (count_visible_events(el_table) == 0 ) {
        el_footer.html(empty_message);
      } else {
        el_footer.html("");
      }
    });
  }

  //////
  // Set whether event rows are shown.
  //////
  function update_event_visibility(toggle_class, el_table, el_count, state) {
    // Show or hide the rows.
    $( toggle_class, el_table ).each(function( index ) {
      if (state) {
        $(this).addClass("visible_event").removeClass("hidden_event");
      } else {
        $(this).addClass("hidden_event").removeClass("visible_event");
      }
    });

    apply_altrow(el_table);
    
    // Adjust how the count is displayed.
    if (state) {
      $(el_count).removeClass('caption_count_hidden');
    } else {
      $(el_count).addClass('caption_count_hidden');
    }
    
    // Persist the setting.
    events_visible[toggle_class] = state;
    saveCookies()
  }

  //////
  // Count the visible rows.
  //////
  function count_visible_events(el_table) {
    var numVisible = 0;
    $( ".visible_event", el_table ).each(function( index ) {
      numVisible += 1;
    });
    return numVisible;
  }


  ////////////////////////////////
  // Daily diary panel code
  ////////////////////////////////

  //////
  // Process the button date changes.
  // Because days may be 23, 24 or 25 hours long, and because the datepicker always returns midnight of the
  // selected date, change date by subtracting 20 hours or adding 26 hours. The datepicker takes care of
  // rounding to mignight again itself.
  //////
  function updateDate(direction) {
    if (!(isBusyR || isBusyW)) {
      var currentDate = $('#daily_datepicker').datepicker( "getDate" );
      var newTime = currentDate.getTime();
      if (direction < 0) {
        //newTime -= 86400000;
        newTime -= 79200000; // 22 hours
      } else if (direction > 0) {
        //newTime += 86400000;
        newTime += 93600000; // 26 hours
      } else {
        newTime = today_start * 1000;
      }
      if (newTime >= (min_time * 1000) && newTime <= (max_time * 1000)) {
        currentDate.setTime(newTime);
        $('#daily_datepicker').datepicker("setDate", currentDate);
        // Setting the date doesn't fire the onSelect, so repeat that code here.

        // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
        log_stuff("Simulated datepicker.onSelect(" + new Date(newTime) + ")");
        var chosen = get_tv_day_start(newTime / 1000, true);
        update_daily(chosen);
      }
    }
  }
  
  //////
  // When the date selection changes, request new recorded & watched tables.
  //////
  function update_daily(chosen) {
    daily_start_time = chosen;
    log_stuff("update_daily today_start=" + new Date(today_start * 1000) + ", daily_start_time=" + new Date(daily_start_time * 1000));

    // Main page heading.
    $('#daily_title_date').html( $.datepicker.formatDate("D d MM yy", new Date(daily_start_time * 1000)) );

    // Blank the tables and show progress indicators.
    $('#daily_recorded_table tbody').html("");
    $('#daily_recorded_footer').html("");
    $('#daily_recorded_spinner').show('fast');
    $('#daily_watched_table tbody').html("");
    $('#daily_watched_footer').html("");
    $('#daily_watched_spinner').show('fast');
    $('#daily_watchlist_table tbody').html("");
    $('#daily_watchlist_footer').html("");
    $('#daily_watchlist_spinner').show('fast');

    var show_watched;
    var show_watchlist;
    // Temporary table headings.
    if (daily_start_time < today_start) {
      $('#daily_recorded_caption').html( "Recorded" );
      show_watched = true;
      show_watchlist = false;
    } else if (daily_start_time > today_start) {
      $('#daily_recorded_caption').html( "To be recorded" );
      show_watched = false;
      show_watchlist = true;
    } else {
      $('#daily_recorded_caption').html( "Recorded / To be recorded" );
      show_watched = true;
      show_watchlist = true;
    }
    $('#daily_watched_caption').html( "Watched" );
    $('#daily_watchlist_caption').html( "Suggested new programmes" );
    log_stuff("Temp caption now=" + new Date() + ", update_daily(" + new Date(chosen * 1000) + ") daily_start_time=" + new Date(daily_start_time * 1000) + ", today_start=" + new Date(today_start * 1000) + ", set caption to=" + $('#recorded_caption').html());

    var r_url;
    var w_url;
    var wl_url;
    if (typeof snapshot_time == "undefined") {
      // Pass the browser's time to the web server - helps when clocks aren't synced.
      var now_time = Math.round(new Date().getTime() / 1000);
      r_url = "/tvdiary/day_json.jim?start=" + daily_start_time + "&current_time=" + now_time + "&type=R";
      w_url = "/tvdiary/day_json.jim?start=" + daily_start_time + "&current_time=" + now_time + "&type=W";
      var watch_start = Math.max(daily_start_time, now_time);
      // +26 hours then round down, for DST swap days.
      var watch_end = get_tv_day_start(daily_start_time + 93600);
      wl_url = "/tvdiary/watchlist_json.jim?start=" + watch_start + "&end=" + watch_end;
    } else {
      var date_filename = $.datepicker.formatDate("yy_mm_dd", new Date(daily_start_time * 1000));
      r_url = "/tvdiary/json/" + date_filename + "_R.json?nocache";
      w_url = "/tvdiary/json/" + date_filename + "_W.json?nocache";
      wl_url = "/tvdiary/json/" + date_filename + "_WL.json?nocache";
    }

    if (show_watched) {
      $('#daily_watched_outer').show();

      // Asynchronously request the watched table data. First, so it may get the DB lock first because it's quicker.
      isBusyW = true;
      $.ajax({
        type: "GET",
        dataType: "json",
        url: w_url,
        success: function(data) {
          if (data.status == "OK" ) {
            if (data.events.length == 0) {
              $('#daily_watched_footer').html("<span class=\"nothing\">Nothing</span>");
            } else {
              $('#daily_watched_caption').html(day_json_to_watched_caption(data));
              $('#daily_watched_table tbody').html(day_json_to_html(data));

              bind_caption_counts($('#daily_watched_caption'), $('#daily_watched_table'), $('#daily_watched_footer'), "<span class=\"nothing\">All live programmes hidden</span>");
              update_event_visibility(".live_event", $('#daily_watched_table'), $('#daily_watched_caption span[toggle=".live_event"]'), events_visible[".live_event"]);
              if (count_visible_events($('#daily_watched_table')) == 0 ) {
                $('#daily_watched_footer').html("<span class=\"nothing\">All live programmes hidden</span>");
              } else {
                $('#daily_watched_footer').html("");
              }

              bind_dejavu($('#daily_watched_table'));
              bind_crid_repeats($('#daily_watched_table'));
              bind_inventory($('#daily_watched_table'));
            }
          } else {
            $('#daily_watched_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
          }
          $('#daily_watched_spinner').hide('slow');
          isBusyW = false;
        },
        error: function(_, _, e) {
          log_stuff("ajax error " + e);
          $('#daily_watched_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
          $('#daily_watched_spinner').hide('slow');
          isBusyW = false;
        }
      });
    } else {
      $('#daily_watched_outer').hide();
    }

    // Asynchronously request the recorded table data.
    isBusyR = true;
    $.ajax({
      type: "GET",
      dataType: "json",
      url: r_url,
      success: function(data) {
        if (data.status == "OK" ) {
          if (data.events.length == 0) {
            $('#daily_recorded_footer').html("<span class=\"nothing\">Nothing</span>");
          } else {
            $('#daily_recorded_caption').html(day_json_to_recorded_caption(data));
            check_overlaps(data);
            $('#daily_recorded_table tbody').html(day_json_to_html(data));
            apply_altrow($('#daily_recorded_table'));
            bind_dejavu($('#daily_recorded_table'));
            bind_crid_repeats($('#daily_recorded_table'));
            bind_inventory($('#daily_recorded_table'));
          }
        } else {
          $('#daily_recorded_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        $('#daily_recorded_spinner').hide('slow');
        isBusyR = false;
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#daily_recorded_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#daily_recorded_spinner').hide('slow');
        isBusyR = false;
      }
    });

    if (watchlist_enabled && show_watchlist) {
      $('#daily_watchlist_outer').show();

      // Asynchronously request the watchlist table data.
      isBusyWl = true;
      $.ajax({
        type: "GET",
        dataType: "json",
        url: wl_url,
        success: function(data) {
          if (data.status == "OK" ) {
            if (data.events.length == 0) {
              $('#daily_watchlist_footer').html("<span class=\"nothing\">Nothing</span>");
            } else {
              var groups_array = build_groups_array(data);
              $('#daily_watchlist_caption').html(day_grouped_watchlist_json_to_caption(data, groups_array));
              $('#daily_watchlist_table tbody').html(day_grouped_watchlist_json_to_html(data, groups_array));

              bind_caption_counts($('#daily_watchlist_caption'), $('#daily_watchlist_table'), $('#daily_watchlist_footer'), "<span class=\"nothing\">All programmes filtered out</span>");
              update_event_visibility(".dwatch_repeat", $('#daily_watchlist_table'), $('#daily_watchlist_caption span[toggle=".dwatch_repeat"]'), events_visible[".dwatch_repeat"]);
              if (count_visible_events($('#daily_watchlist_table')) == 0 ) {
                $('#daily_watchlist_footer').html("<span class=\"nothing\">All programmes filtered out</span>");
              } else {
                $('#daily_watchlist_footer').html("");
              }

              apply_altrow($('#daily_watchlist_table'));
              bind_dejavu($('#daily_watchlist_table'));
              bind_crid_repeats($('#daily_watchlist_table'));
            }
          } else {
            $('#daily_watchlist_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
          }
          $('#daily_watchlist_spinner').hide('slow');
          isBusyWl = false;
        },
        error: function(_, _, e) {
          log_stuff("ajax error " + e);
          $('#daily_watchlist_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
          $('#daily_watchlist_spinner').hide('slow');
          isBusyWl = false;
        }
      });
    } else {
      $('#daily_watchlist_outer').hide();
    }
  }

  //////
  // Check for too many overlapping scheduled recordings.
  // Updates the data, so call before rendering as HTML.
  //////
  function check_overlaps(data) {
    // Find overlaps between future events and active recordings.
    var overlaps = [];
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event_a = data.events[i];
      if (event_a.type == "future" || event_a.type == "future_series" || (event_a.type == "record" && event_a.active)) {
        for (var j = i + 1; j < len; j++) {
          var event_b = data.events[j];
          if (event_b.type == "future" || event_b.type == "future_series" || (event_b.type == "record" && event_b.active)) {
            if ((event_b.scheduled_start >= event_a.scheduled_start && event_b.scheduled_start < event_a.scheduled_end)
              || (event_b.scheduled_end >= event_a.scheduled_start && event_b.scheduled_start < event_a.scheduled_end)
              || (event_b.scheduled_start < event_a.scheduled_start && event_b.scheduled_end >= event_a.scheduled_end)) {
              var overlap = {
                index_a: i,
                index_b: j,
                start: Math.max(event_a.scheduled_start, event_b.scheduled_start),
                end:  Math.min(event_a.scheduled_end, event_b.scheduled_end)
              };
              overlaps.push(overlap);
              log_stuff("Overlap: event_a=" + i + " starts " + new Date(event_a.scheduled_start*1000) + " ends " + new Date(event_a.scheduled_end*1000) + " titled " + event_a.title);
              log_stuff("Overlap: event_b=" + j + " starts " + new Date(event_b.scheduled_start*1000) + " ends " + new Date(event_b.scheduled_end*1000) + " titled " + event_b.title);
              log_stuff("Overlap: start=" + new Date(overlap.start*1000) + " end " + new Date(overlap.end*1000));
            }
          }
        }
      }
    }
    
    // Find overlaps between the overlaps. Because any 2 events can only have 1 overlap, this means there are > 2 events overlapping.
    for (var i = 0, len = overlaps.length; i < len; i++) {
      var overlap_a = overlaps[i];
      for (var j = i + 1; j < len; j++) {
        var overlap_b = overlaps[j];
        if ((overlap_b.start >= overlap_a.start && overlap_b.start < overlap_a.end)
          || (overlap_b.end >= overlap_a.start && overlap_b.start < overlap_a.end)
          || (overlap_b.start < overlap_a.start && overlap_b.end >= overlap_a.end)) {
          log_stuff("Overlap: overlap_a start " + new Date(overlap_a.start*1000) + " end " + new Date(overlap_a.end*1000));
          log_stuff("Overlap: overlap_b start " + new Date(overlap_b.start*1000) + " end " + new Date(overlap_b.end*1000));
          log_stuff("Overlaping overlap: start " + new Date(Math.max(overlap_a.start, overlap_b.start)*1000) + " end " + new Date(Math.min(overlap_a.end, overlap_b.end)*1000));
          log_stuff("Affected events: " + overlap_a.index_a + ", " + overlap_a.index_b + ", " + overlap_b.index_a + ", " + overlap_b.index_b);
          // Mark the affected events.
          data.events[overlap_a.index_a].overlapWarning = true;
          data.events[overlap_a.index_b].overlapWarning = true;
          data.events[overlap_b.index_a].overlapWarning = true;
          data.events[overlap_b.index_b].overlapWarning = true;
        }
      }
    }
  }
  
  //////
  // Render table body HTML from JSON.
  //////
  function day_json_to_html(data) {
    var html = "";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      // typeclass and activeclass CSS.
      var typeclass;
      switch (event.type) {
        case "future":
        case "future_series":
          typeclass = "future_event";
          break;
        case "record":
          typeclass = "record_event";
          break;
        case "live":
          typeclass = "live_event";
          break;
        case "play":
        default:
          typeclass = "play_event";
          break;
      }
      var activeclass = "";
      if (event.active) {
        activeclass = " active_event";
      }
      var clashclass = "";
      if (event.overlapWarning) {
        clashclass = " clash_event";
      }

      html += "<tr class=\"event_row visible_event " + typeclass + activeclass + clashclass + "\">";

      //
      // Column 1. The actual record or watching time. This is always known.
      //
      html += "<td class=\"event_time\">";
      html += "<div class=\"event_start\">" + formatTime(event.event_start) + "</div>";
      if (event.type == "record" && event.active) {
        html += "<div class=\"event_duration in_progress\">" + event.event_duration + (event.event_duration == 1 ? " min" : " mins") + "</div>";
        html += "<div class=\"event_end in_progress\">" + formatTime(event.event_end) + "</div>";
        html += "<div class=\"event_duration\">&nbsp;</div>";
        html += "<div class=\"event_end\">" + formatTime(event.scheduled_end) + "</div>";
      } else {
        html += "<div class=\"event_duration\">" + event.event_duration + (event.event_duration == 1 ? " min" : " mins") + "</div>";
        html += "<div class=\"event_end\">" + formatTime(event.event_end) + "</div>";
      }
      html += "</td>";

      //
      // Column 2. The channel icon and name.
      //
      html += "<td class=\"tvchannel\">";
      if (event.channel_name != "") {
        html += "<img src=\"" + event.channel_icon_path + "\" width=50 height=50 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
        html += "<div>" + escapeHtml(event.channel_name) + "</div>";
      }
      html += "</td>";

      //
      // Column 3. There will always be a title. There might not be a synopsis, and there might not be sheduled time and duration.
      //
      html += "<td class=\"event_descr\">";
      html += "<span class=\"tvtitle\">" + escapeHtml(event.title) + "</span>";
      if (event.synopsis != "") {
        html += "<span class=\"tvsynopsis\">" + escapeHtml(event.synopsis) + "</span>";
      }
      if (event.scheduled_start != 0 && event.scheduled_duration != 0) {
        html += "<span class=\"tvschedule\">(" + formatDateTime(event.scheduled_start) + ", " + event.scheduled_duration + (event.scheduled_duration == 1 ? " min" : " mins") + ")</span>";
      }
      html += "</td>"

      //
      // Column 4. Icons for unwatched. deleted-unwatched and deja vu icons.
      //
      html += "<td class=\"event_flags\">";
      if (inventory_enabled) {
        if (event.type == "record" && !event.watched) {
          if (!event.available) {
            html += "<img src=\"images/deleted_unwatched.png\" width=16 height=16 title=\"deleted unwatched\">";
          } else {
            html += "<img src=\"images/unwatched.png\" width=16 height=16 title=\"unwatched\">";
          }
        }
        if (event.available) {
          html += "<a class=\"inventory\" href=\"#\"><img src=\"images/available.png\" width=16 height=16 title=\"available\"></a>";
        }
      }
      if (event.repeat_crid_count > 0) {
        html += " <a class=\"repeat\" prog_crid=\"" + event.event_crid + "\" href=\"#\"><img src=\"images/repeat.png\" width=16 height=16 title=\"CRID repeat\"></a>";
      } else if (event.repeat_program_id != -1) {
        html += " <a class=\"dejavu\" prog_id=\"" + event.repeat_program_id + "\" href=\"#\"><img src=\"images/dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
      }
      if (event.type == "future") {
        html += "<img src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording programme\">";
      } else if (event.type == "future_series") {
        html += "<img src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording series\">";
      }
      html += "</td>"

      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Calculate the duration for one row, constrained by the display range.
  // NB durations are all in minutes, times are in seconds.
  //////
  function duration_within_display_range(range_start, range_end, event_start, event_end) {
    if (event_start < range_start) {
      return duration_seconds_to_minutes(event_end - range_start);
    } else if (event_end > range_end) {
      return duration_seconds_to_minutes(range_end - event_start);
    } else {
      return duration_seconds_to_minutes(event_end - event_start);
    }    
  }

  //////
  // Upon loading the recorded data, count the recorded & scheduled durations for the updated heading.
  //////
  function day_json_to_recorded_caption(data) {
    var total_recorded = 0;
    var total_scheduled = 0;
    // Nothing rather than total == 0 allows 0:00 at date changeovers.
    var nothing_recorded = true;
    var nothing_scheduled = true;

    // Calculate based on the time range from the table, not what was requested.
    var report_time = data.current_time;
    var report_day_start = get_tv_day_start(report_time, false);

    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      
      if (event.type == "record") {
        var constrained_duration = duration_within_display_range(data.time_start, data.time_end, event.event_start, event.event_end);
        total_recorded += constrained_duration;
        nothing_recorded = false;
      } else if (event.type == "future" || event.type == "future_series") {
        var constrained_duration = duration_within_display_range(data.time_start, data.time_end, event.event_start, event.event_end);
        total_scheduled += constrained_duration;
        nothing_scheduled = false;
      }

      // Add on the remaining time for active recordings
      if (event.type == "record" && event.active) {
        var constrained_duration = 0;
        if (report_time < data.time_start) {
          // Now is before the range - only include time from the range start to scheduled end.
          constrained_duration = Math.ceil((event.scheduled_end - data.time_start) / 60);

        } else if (report_time > data.time_end) {
          // Now is after the range - nothing to include, it's all tomorrow.
          constrained_duration = 0;

        } else if (event.scheduled_end > data.time_end) {
          // Now is near the end of day, within range - include from now to the range end.
          constrained_duration = Math.ceil((data.time_end - report_time) / 60);

        } else {
          // Now must be near the start of day, within range - include from now to the scheduled end.
          constrained_duration = Math.ceil((event.scheduled_end - report_time) / 60);

        }
        log_stuff("update_recorded_duration() recording time for constrained_duration=" + constrained_duration + ", report_time=" + new Date(report_time * 1000) + " scheduled_end=" + new Date(event.scheduled_end * 1000) + ", data.time_start=" + new Date(data.time_start * 1000) + ", data.time_end=" + new Date(data.time_end * 1000));
        // constrained_duration could be -ve if a show is over-running its scheduled end.
        if (constrained_duration > 0) {
          total_scheduled += constrained_duration;
          nothing_scheduled = false;
        }
      }
    }
    
    var result;
    if (data.time_start < report_day_start) {
      if (nothing_recorded) {
        result = "Recorded nothing";
      } else {
        result = "Recorded: " + format_duration(total_recorded);
      }
    } else if (data.time_start > report_day_start) {
      if (nothing_scheduled) {
        result = "Nothing to be recorded";
      } else {
        result = "To be recorded: " + format_duration(total_scheduled);
      }
    } else {
      if (nothing_recorded && nothing_scheduled) {
        result = "Recorded nothing";
      } else if (nothing_recorded) {
        result = "To be recorded - " + format_duration(total_scheduled);
      } else if (nothing_scheduled) {
        result = "Recorded: " + format_duration(total_recorded);
      } else {
        result = "Recorded: " + format_duration(total_recorded) + " / To be recorded: " + format_duration(total_scheduled);
      }
    }
    log_stuff("Recorded caption now=" + new Date() + ", update_recorded_duration() data.time_start=" + new Date(data.time_start*1000) + ", report_day_start=" + new Date(report_day_start*1000) + ", total_recorded=" + total_recorded + ", total_scheduled=" + total_scheduled + ", set caption to=" + result);
    return result;
  }

  //////
  // Upon loading the watched data, count the played & live durations & update the heading.
  //////
  function day_json_to_watched_caption(data) {
    var total_played = 0;
    var total_live = 0;
    // Nothing rather than total == 0 allows 0:00 at date changeovers.
    var nothing_played = true;
    var nothing_live = true;

    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      
      if (event.type == "play") {
        var constrained_duration = duration_within_display_range(data.time_start, data.time_end, event.event_start, event.event_end);
        total_played += constrained_duration;
        nothing_played = false;
      } else if (event.type == "live") {
        var constrained_duration = duration_within_display_range(data.time_start, data.time_end, event.event_start, event.event_end);
        total_live += constrained_duration;
        nothing_live = false;
      }
    }

    var combined_duration = total_played + total_live;

    var result;    
    if (nothing_played && nothing_live) {
      result = "Watched nothing";
    } else if (nothing_live) {
      result = "Watched: " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + ")";
    } else if (nothing_played) {
      result = "Watched: " + format_duration(combined_duration) + " (<span class=\"caption_count\" toggle=\".live_event\">Live: " + format_duration(total_live) + "</span>)";
    } else {
      result = "Watched: " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + " / <span class=\"caption_count\" toggle=\".live_event\">Live: " + format_duration(total_live) + "</span>)";
    }
    return result;
  }

  //////
  // Build array of arrays to event IDs, grouped by matching titles and synopses.
  // Where event_crids match, it trumps the title & synopsis check.
  //////
  function build_groups_array(data) {
    var results = new Array();
    
    // Map from CRID to group index.
    var crids_map = {};
    
    var group_title = "";
    var group_synopsis = "";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];

      // Check CRID first.
      var crid_index = crids_map[event.event_crid];
      if (crid_index != undefined) {

        // Add new member to existing group.
        var members = results[crid_index];
        members.push(i);

      } else {
      
        // Is next event in current group, or start a new one?
        if (results.length > 0 && event.title == group_title && event.synopsis == group_synopsis) {
          // Add new member to the latest existing group.
          var members = results[results.length - 1];
          members.push(i);
        } else {
          // Create new members array with this event, and push a new group.
          var new_members = [i];
          results.push(new_members);
          group_title = event.title;
          group_synopsis = event.synopsis;
          
          // Remember the index of this group in the CRID map.
          if (event.event_crid.length > 0) {
            crids_map[event.event_crid] = results.length - 1;
          }
        }

      }
    }
    return results;
  }

  //////
  // Render table body HTML from JSON - grouped.
  //////
  function day_grouped_watchlist_json_to_html(data, groups_array) {
    var html = "";
    for (var i = 0, len_i = groups_array.length; i < len_i; i++) {
      var group_members = groups_array[i];

      // Scan members for repeat indications - any of them flagged means the whole group is flagged.
      var classes = "";
      for (var j = 0, len_j = group_members.length; j < len_j; j++) {
        var event = data.events[group_members[j]];
        if ( (event.repeat_crid_count > 0)
          || (event.repeat_program_id != -1)
          || (event.ucRecKind == 1 || event.ucRecKind == 2 || event.ucRecKind == 4 || event.crid_ucRecKind == 1 || event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4)) {
          classes = " dwatch_repeat";
          break;
        }
      }

      var event = data.events[group_members[0]];

      //
      // Group start row - 1 column spanning 3. The title and synopsis, formatted like the other daily tables, but no time.
      //
      html += "<tr class=\"event_row visible_event" + classes + "\">";

      html += "<td colspan=\"3\" class=\"event_descr\">";
      html += "<span class=\"tvtitle\">" + escapeHtml(event.title) + "</span>";
      if (event.synopsis != "") {
        html += "<span class=\"tvsynopsis\">" + escapeHtml(event.synopsis) + "</span>";
      }
      html += "</td>"

      // Dummy column 4 - flags.
      html += "<td class=\"dwatch_flags\">";
      html += "</td>"

      html += "</tr>";

      // Iterate over all members to render their channels, times and flags on separate rows.
      for (var j = 0, len_j = group_members.length; j < len_j; j++) {
        var event = data.events[group_members[j]];
        
        html += "<tr class=\"event_row visible_event" + classes + "\">";

        // Column 1 - dummy padding, to be as wide as possible to push the others to the right.
        html += "<td class=\"dwatch_padding\">";
        html += "</td>";
        
        // Column 2 - the channel, small icon horizontally aligned.
        html += "<td class=\"dwatch_channel\">";
        if (event.channel_name != "") {
          html += "<div>";
          html += "<img src=\"" + event.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
          html += "<span>" + escapeHtml(event.channel_name) + "</span>";
          html += "</div>";
        }
        html += "</td>";

        // Column 3 - Time and duration.
        html += "<td class=\"dwatch_datetime\">";
        html += "<span class=\"tvschedule\">" + formatDateTime(event.start) + ", " + event.duration + (event.duration == 1 ? " min" : " mins") + "</span>";
        html += "</td>";

        // Column 4 - flags.
        html += "<td class=\"dwatch_flags\">";
        if (event.repeat_crid_count > 0) {
          html += " <a class=\"repeat\" prog_crid=\"" + event.event_crid + "\" href=\"#\"><img src=\"images/repeat.png\" width=16 height=16 title=\"CRID repeat\"></a>";
        } else if (event.repeat_program_id != -1) {
          html += " <a class=\"dejavu\" prog_id=\"" + event.repeat_program_id + "\" href=\"#\"><img src=\"images/dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
        }
        if (event.ucRecKind == 1) {
          html += "<img src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording programme\">";
        } else if (event.ucRecKind == 2 || event.ucRecKind == 4) {
          html += "<img src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording series\">";
        } else if (event.crid_ucRecKind == 1) {
          html += "<img class=\"collateral_scheduled\" src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording another time\">";
        } else if (event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4) {
          html += "<img class=\"collateral_scheduled\" src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording another time\">";
        }
        html += "</td>";

        html += "</tr>";
      }
    }
    return $(html);
  }

  //////
  // Render results caption from JSON.
  //////
  function day_grouped_watchlist_json_to_caption(data, groups_array) {
    var num_new = 0;
    var num_repeats = 0;

    for (var i = 0, len_i = groups_array.length; i < len_i; i++) {
      var group_members = groups_array[i];

      // Scan members for repeat indications - any of them flagged means the whole group is flagged.
      for (var j = 0, len_j = group_members.length; j < len_j; j++) {
        var event = data.events[group_members[j]];
        if ( (event.repeat_crid_count > 0)
          || (event.repeat_program_id != -1)
          || (event.ucRecKind == 1 || event.ucRecKind == 2 || event.ucRecKind == 4 || event.crid_ucRecKind == 1 || event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4)) {
          num_repeats += 1;
          break;
        }
      }
    }
    num_new = groups_array.length - num_repeats;

    caption = "";
    if (num_new > 0) {
      caption += num_new + (num_new == 1 ? " suggested new programme" : " suggested new programmes");
    }
    if (num_new > 0 && num_repeats > 0) {
      caption += " / ";
    }
    if (num_repeats > 0) {
      caption += "<span class=\"caption_count\" toggle=\".dwatch_repeat\">" + num_repeats + (num_repeats == 1 ? " repeat" : " repeats") + "</span>";
    }
    return caption;
  }

  //////
  // Render table body HTML from JSON - flat. (To be obsoleted.)
  //////
  function day_watchlist_json_to_html(data) {
    var html = "";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];

      var classes = "";
      if ( (event.repeat_crid_count > 0)
        || (event.repeat_program_id != -1)
        || (event.ucRecKind == 1 || event.ucRecKind == 2 || event.ucRecKind == 4 || event.crid_ucRecKind == 1 || event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4)) {
        classes = " dwatch_repeat";
      }

      html += "<tr class=\"event_row visible_event future_event" + classes + "\">";

      //
      // Column 1. The actual record or watching time. This is always known.
      //
      html += "<td class=\"event_time\">";
      html += "<div class=\"event_start\">" + formatTime(event.start) + "</div>";
      html += "<div class=\"event_duration\">" + event.duration + (event.duration == 1 ? " min" : " mins") + "</div>";
      html += "<div class=\"event_end\">" + formatTime(event.end) + "</div>";
      html += "</td>";

      //
      // Column 2. The channel icon and name.
      //
      html += "<td class=\"tvchannel\">";
      if (event.channel_name != "") {
        html += "<img src=\"" + event.channel_icon_path + "\" width=50 height=50 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
        html += "<div>" + escapeHtml(event.channel_name) + "</div>";
      }
      html += "</td>";

      //
      // Column 3. There will always be a title. There might not be a synopsis, and there might not be sheduled time and duration.
      //
      html += "<td class=\"event_descr\">";
      html += "<span class=\"tvtitle\">" + escapeHtml(event.title) + "</span>";
      if (event.synopsis != "") {
        html += "<span class=\"tvsynopsis\">" + escapeHtml(event.synopsis + " {" + event.event_crid + "}" ) + "</span>";
      }
      if (event.start != 0 && event.duration != 0) {
        html += "<span class=\"tvschedule\">(" + formatDateTime(event.start) + ", " + event.duration + (event.duration == 1 ? " min" : " mins") + ")</span>";
      }
      html += "</td>"

      //
      // Column 4. Icons for unwatched. deleted-unwatched and deja vu icons.
      //
      html += "<td class=\"event_flags\">";
      if (event.repeat_crid_count > 0) {
        html += " <a class=\"repeat\" prog_crid=\"" + event.event_crid + "\" href=\"#\"><img src=\"images/repeat.png\" width=16 height=16 title=\"CRID repeat\"></a>";
      } else if (event.repeat_program_id != -1) {
        html += " <a class=\"dejavu\" prog_id=\"" + event.repeat_program_id + "\" href=\"#\"><img src=\"images/dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
      }
      if (event.ucRecKind == 1) {
        html += "<img src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording programme\">";
      } else if (event.ucRecKind == 2 || event.ucRecKind == 4) {
        html += "<img src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording series\">";
      } else if (event.crid_ucRecKind == 1) {
        html += "<img class=\"collateral_scheduled\" src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording another time\">";
      } else if (event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4) {
        html += "<img class=\"collateral_scheduled\" src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording another time\">";
      }
      html += "</td>"

      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render results caption from JSON.
  //////
  function day_watchlist_json_to_caption(data) {
    var num_matches = data.events.length;
    var num_new = 0;
    var num_repeats = 0;
    var distinct_new_crids = new Array();
    
    for (var i = 0; i < num_matches; i++) {
      var event = data.events[i];
      if ( (event.repeat_crid_count > 0)
        || (event.repeat_program_id != -1)
        || (event.ucRecKind == 1 || event.ucRecKind == 2 || event.ucRecKind == 4 || event.crid_ucRecKind == 1 || event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4)) {
        num_repeats += 1;
        isNew = false;
      } else {
        num_new += 1;
        if (distinct_new_crids.indexOf(event.event_crid) == -1) {
          distinct_new_crids.push(event.event_crid);
        }
      }
    }

    caption = "";
    if (num_new > 0) {
      caption += num_new + (num_new == 1 ? " suggested new programme" : " suggested new programmes");
    }
    if (num_new > 0 && num_repeats > 0) {
      caption += " / ";
    }
    if (num_repeats > 0) {
      caption += "<span class=\"caption_count\" toggle=\".dwatch_repeat\">" + num_repeats + (num_repeats == 1 ? " repeat" : " repeats") + "</span>";
    }
    return caption;
  }


  ////////////////////////////////
  // Monthly summaries panel code
  ////////////////////////////////

  //////
  // Process the buttons in monthly summary.
  //////
  function updateMonth(direction) {
    if (!isBusyM) {
      var selIndex = $('#monthly_month_selector').prop("selectedIndex");
      var maxIndex = $('#monthly_month_selector option').size() - 1;
      var newIndex;
      if (direction == 0) {
        newIndex = maxIndex;
      } else {
        newIndex = selIndex + direction;
      }
      if (newIndex >= 0 && newIndex <= maxIndex && newIndex != selIndex) {
        $('#monthly_month_selector').prop("selectedIndex", newIndex).change();
      }
    }
  }
  
  //////
  // When the date is changed for monthly summaries.
  //////
  function update_monthly(year, month) {
    monthly_year = year;
    monthly_month = month;
    log_stuff("update_month year=" + year + ", month=" + month);

    // Blank the tables and the message footer, and show progress indicators.
    $('#monthly_programs_table tbody').html("");
    $('#monthly_programs_table').trigger("update");
    $('#monthly_programs_caption').html("Programmes");
    $('#monthly_programs_footer').html("");
    $('#monthly_programs_spinner').show('fast');

    $('#monthly_channels_table tbody').html("");
    $('#monthly_channels_table').trigger("update"); 
    $('#monthly_channels_caption').html("Channels");
    $('#monthly_channels_footer').html("");
    $('#monthly_channels_spinner').show('fast');

    var m_url;
    if (typeof snapshot_time == "undefined") {
      m_url = "/tvdiary/monthly_json.jim?year=" + year + "&month=" + month;
    } else {
      m_url = "/tvdiary/json/" + year + "_" + month + "_M.json?nocache";
    }

    // Asynchronously request the summary tables' data.
    isBusyM = true;
    $('#monthly_month_selector').attr("disabled", "disabled");
    $.ajax({
      type: "GET",
      dataType: "json",
      url: m_url,
      success: function(data) {
        if (data.status == "OK" ) {
          if (data.programs.length > 0) {
            $('#monthly_programs_table tbody').html(monthly_json_to_programs_html(data));
            apply_altrow($('#monthly_programs_table'));
            bind_program_history($('#monthly_programs_table'));
            $("#monthly_programs_table").trigger("update");
            // Must delay sorting because the tablesorter introduces a delay before it acts on the "update".
            setTimeout(function(){
              $("#monthly_programs_table").trigger("sorton",[programs_sorting]); 
            }, 2);
            $('#monthly_programs_caption').html(monthly_json_to_programs_caption(data));
          } else {
            $('#monthly_programs_footer').html("<span class=\"nothing\">No data available</span>");
          }

          if (data.channels.length > 0) {
            $('#monthly_channels_table tbody').html(monthly_json_to_channels_html(data));
            apply_altrow($('#monthly_channels_table'));
            $("#monthly_channels_table").trigger("update"); 
            // Must delay sorting because the tablesorter introduces a delay before it acts on the "update".
            setTimeout(function(){
              $("#monthly_channels_table").trigger("sorton",[channels_sorting]); 
            }, 2);
            // Channels totals should be same as programmes.
            //$('#monthly_channels_caption').html(monthly_json_to_channels_caption(data));
          } else {
            $('#monthly_channels_footer').html("<span class=\"nothing\">No data available</span>");
          }
        } else {
          $('#monthly_programs_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
          $('#monthly_channels_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        $('#monthly_programs_spinner').hide('slow');
        $('#monthly_channels_spinner').hide('slow');
        isBusyM = false;
        $('#monthly_month_selector').removeAttr("disabled");
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#monthly_programs_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#monthly_programs_spinner').hide('slow');
        $('#monthly_channels_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#monthly_channels_spinner').hide('slow');
        isBusyM = false;
        $('#monthly_month_selector').removeAttr("disabled");
      }
    });
  }

  //////
  // Render monthly programs table HTML from JSON.
  //////
  function monthly_json_to_programs_html(data) {
    var html = "";
    var len = data.programs.length;
    for (var i = 0; i < len; i++) {
      var program = data.programs[i];

      html += "<tr class=\"event_row visible_event\">";
      html += "<td></td>";
      html += "<td><a class=\"history_link\" title_id=\"" + program.title_id + "\" channel_id=\"" + program.channel_id + "\" href=\"#\">" + escapeHtml(program.title) + "</a></td>";
      html += "<td>";
      if (program.channel_name != "") {
        html += "<div>";
        html += "<img src=\"" + program.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(program.channel_name) + "\"/>";
        html += "<span>" + escapeHtml(program.channel_name) + "</span>";
        html += "</div>";
      }
      html += "</td>";
      html += "<td>" + program.recorded_count + "</td>";
      html += "<td>" + program.played_count + "</td>";
      html += "<td>" + program.live_count + "</td>";
      html += "<td>" + program.barely_watched_count + "</td>";
      html += "<td sval=\"" + program.scheduled_duration + "\">" + format_duration(program.scheduled_duration) + "</td>";
      html += "<td sval=\"" + program.recorded_duration +"\">" + format_duration(program.recorded_duration) + "</td>";
      html += "<td sval=\"" + program.played_duration + "\">" + format_duration(program.played_duration) + "</td>";
      html += "<td sval=\"" + program.live_duration + "\">" + format_duration(program.live_duration) + "</td>";
      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render monthly programs table caption from JSON.
  //////
  function monthly_json_to_programs_caption(data) {
    var scheduled_dur = 0;
    var recorded_dur = 0;
    var media_dur = 0;
    var live_dur = 0;
    var len = data.programs.length;
    for (var i = 0; i < len; i++) {
      var program = data.programs[i];

      scheduled_dur += program.scheduled_duration;
      recorded_dur += program.recorded_duration;
      media_dur += program.played_duration;
      live_dur += program.live_duration;
    }
    return "Programmes - Recorded: " + format_duration(recorded_dur) + " - Watched: " + format_duration(media_dur + live_dur) + " (Media: " + format_duration(media_dur) + " / Live: " + format_duration(live_dur) + ")";
  }

  //////
  // Bind click handler to all monthly program history links.
  //////
  function bind_program_history(el) {
    $('a.history_link', el).click(function(e) {
      e.preventDefault();

      var title_id = $(this).attr('title_id');
      var channel_id = $(this).attr('channel_id');
      update_history_title_channel(title_id, channel_id);
      $("#tvd_tabs").tabs( "option", "active", tabIndex_search );
    });
  }

  //////
  // Render monthly channels table HTML from JSON.
  //////
  function monthly_json_to_channels_html(data) {
    var html = "";
    var len = data.channels.length;
    for (var i = 0; i < len; i++) {
      var channel = data.channels[i];

      html += "<tr class=\"event_row visible_event\">";
      html += "<td></td>";
      html += "<td>";
      if (channel.channel_name != "") {
        html += "<div>";
        html += "<img src=\"" + channel.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(channel.channel_name) + "\"/>";
        html += "<span>" + escapeHtml(channel.channel_name) + "</span>";
        html += "</div>";
      }
      html += "</td>";
      html += "<td>" + channel.recorded_count + "</td>";
      html += "<td>" + channel.played_count + "</td>";
      html += "<td>" + channel.live_count + "</td>";
      html += "<td sval=\"" + channel.recorded_duration + "\">" + format_duration(channel.recorded_duration) + "</td>";
      html += "<td sval=\"" + channel.played_duration + "\">" + format_duration(channel.played_duration) + "</td>";
      html += "<td sval=\"" + channel.live_duration + "\">" + format_duration(channel.live_duration) + "</td>";
      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render monthly channels table caption from JSON.
  //////
  function monthly_json_to_channels_caption(data) {
    var recorded_dur = 0;
    var media_dur = 0;
    var live_dur = 0;
    var len = data.channels.length;
    for (var i = 0; i < len; i++) {
      var channel = data.channels[i];

      recorded_dur += channel.recorded_duration;
      media_dur += channel.played_duration;
      live_dur += channel.live_duration;
    }
    return "Channels - Recorded: " + format_duration(recorded_dur) + " - Watched: " + format_duration(media_dur + live_dur) + " (Media: " + format_duration(media_dur) + " / Live: " + format_duration(live_dur) + ")";
  }

  ////////////////////////////////
  // Search panel code
  ////////////////////////////////

  //////
  // Request display of history by program_id, for repeats.
  //////
  function update_history_program(prog_id) {
    $('#search_prompt').html("You may have seen this programme already in the past. Searching for activities with the same title and synopsis.");

    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/history_json.jim?program_id=' + prog_id;
    } else {
      var url = '/tvdiary/json/history_' + prog_id + '.json?nocache';
    }
    update_history(url, true);
  }

  //////
  // Request display of history by CRID, for repeats.
  //////
  function update_history_crid(crid) {
    $('#search_prompt').html("This programme is a repeat. Searching for activities with the same CRID.");

    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/history_json.jim?crid=' + encodeURIComponent(crid);
    } else {
      var url = '/tvdiary/json/history_' + encodeURIComponent(crid) + '.json?nocache';
    }
    update_history(url, true);
  }

  //////
  // Request display of history by title_id & channel_id from monthly summary.
  //////
  function update_history_title_channel(title_id, channel_id) {
    $('#search_prompt').html("Searching for activities with the same title on the same channel.");

    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/history_json.jim?title_id=' + title_id + '&channel_id=' + channel_id;
    } else {
      var url = '/tvdiary/json/history_' + title_id + '_' + channel_id + '.json?nocache';
    }
    update_history(url, true);
  }

  //////
  // Request display of history using the text fields.
  //////
  function searchHistory() {
    $('#search_prompt').html("Enter all or part of the title, synopsis or channel name, then search for the history of that programme.");

    var title = $('#search_criteria_title').val();
    var synopsis = $('#search_criteria_synopsis').val();
    var channel = $('#search_criteria_channel').val();
    var title_op = $('#search_criteria_op_title').val();
    var synopsis_op = $('#search_criteria_op_synopsis').val();
    var channel_op = $('#search_criteria_op_channel').val();

    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/history_json.jim?title=' + encodeURIComponent(title) + '&channel=' + encodeURIComponent(channel) + '&synopsis=' + encodeURIComponent(synopsis) + '&title_op=' + title_op + '&channel_op=' + channel_op + '&synopsis_op=' + synopsis_op;
    } else {
      var url = '/tvdiary/json/history_search.json?nocache';
    }
    update_history(url, false);
  }

  //////
  // Request display of history by url.
  //////
  function update_history(url, clearCriteria) {
    // Blank the table and the message footer, and show progress indicators.
    if (clearCriteria) {
      $('#search_criteria_title').val("");
      $('#search_criteria_synopsis').val("");
      $('#search_criteria_channel').val("");
      $('#search_criteria_op_title').val("C");
      $('#search_criteria_op_synopsis').val("C");
      $('#search_criteria_op_channel').val("C");
    }

    $('#search_results_table tbody').html("");
    $('#search_results_table').trigger("update");
    $('#search_results_caption').html("Programme events");
    $('#search_results_footer').html("");
    $('#search_results_spinner').show('fast');

    // Asynchronously request the search tables' data.
    isBusyS = true;
    $('#search_diary_button').attr("disabled", "disabled");
    $('#search_epg_button').attr("disabled", "disabled");
    $.ajax({
      type: "GET",
      dataType: "json",
      url: url,
      success: function(data) {
        if (data.status == "OK" ) {
          $('#search_criteria_title').val(data.title ? data.title : "");
          $('#search_criteria_synopsis').val(data.synopsis ? data.synopsis : "");
          $('#search_criteria_channel').val(data.channel_name ? data.channel_name : "");
          $('#search_criteria_op_title').val(data.title_op ? data.title_op : "C");
          $('#search_criteria_op_synopsis').val(data.synopsis_op ? data.synopsis_op : "C");
          $('#search_criteria_op_channel').val(data.channel_name_op ? data.channel_name_op : "C");
          if (data.events.length > 0) {
            $('#search_results_table tbody').html(history_json_to_html(data));
            apply_altrow($('#search_results_table'));
            bind_dejavu($('#search_results_table'));
            bind_crid_repeats($('#search_results_table'));
            bind_inventory($('#search_results_table'));
            $('#search_results_caption').html(history_json_to_caption(data));
            $("#search_results_table").trigger("update");
            // Must delay sorting because the tablesorter introduces a delay before it acts on the "update".
            setTimeout(function(){
              showingHistoryResults = true;
              $("#search_results_table").trigger("sorton",[history_sorting]); 
            }, 2);
          } else {
            $('#search_results_footer').html("<span class=\"nothing\">No matches found</span>");
          }
        } else {
          $('#search_results_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        $('#search_results_spinner').hide('slow');
        isBusyS = false;
        $('#search_diary_button').removeAttr("disabled");
        $('#search_epg_button').removeAttr("disabled");
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#search_results_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#search_results_spinner').hide('slow');
        isBusyS = false;
        $('#search_diary_button').removeAttr("disabled");
        $('#search_epg_button').removeAttr("disabled");
      }
    });
  }

  //////
  // Render history HTML from JSON.
  //////
  function history_json_to_html(data) {
    var html = "";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      var type_icon;
      switch (event.type) {
        case "future":
        case "future_series":
        case "record":
          type_icon = "images/745_1_11_Video_1REC.png";
          break;
        case "live":
          type_icon = "images/tvmast.png";
          break;
        case "play":
        default:
          type_icon = "images/745_1_10_Video_2Live.png";
          break;
      }
      var duration = duration_seconds_to_minutes(event.end - event.start + 30);

      html += "<tr class=\"event_row visible_event\">";

      html += "<td class=\"search_type\">";
      html += "<img src=\"" + type_icon + "\" width=22 height=22 alt=\"" + event.type + "\" title=\"" + event.type + "\"/>";
      html += "</td>";

      html += "<td class=\"search_channel\">";
      if (event.channel_name != "") {
        html += "<div>";
        html += "<img src=\"" + event.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
        html += "<span>" + escapeHtml(event.channel_name) + "</span>";
        html += "</div>";
      }
      html += "</td>";

      html += "<td class=\"search_title\">";
      html += "<div>" + escapeHtml(event.title) + "</div>";
      html += "</td>";

      html += "<td class=\"search_synopsis\">";
      html += "<div>" + escapeHtml(event.synopsis) + "</div>";
      html += "</td>";

      html += "<td class=\"search_datetime\" sval=\"" + event.start + "\">";
      html += formatDateTime(event.start);
      html += "</td>";
      
      html += "<td class=\"search_duration\" sval=\"" + duration + "\">";
      html += duration + (duration == 1 ? " min" : " mins");
      html += "</td>";

      html += "<td class=\"search_flags\">";
      if (inventory_enabled) {
        if (event.available) {
          html += "<a class=\"inventory\" href=\"#\"><img src=\"images/available.png\" width=16 height=16 title=\"available\"></a>";
        }
      }
      if (event.repeat_crid_count > 0) {
        html += " <a class=\"repeat\" prog_crid=\"" + event.event_crid + "\" href=\"#\"><img src=\"images/repeat.png\" width=16 height=16 title=\"CRID repeat\"></a>";
      } else if (event.repeat_count > 1) {
        html += " <a class=\"dejavu\" prog_id=\"" + event.program_id + "\" href=\"#\"><img src=\"images/dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
      }
      html += "</td>";

      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render results caption from JSON.
  //////
  function history_json_to_caption(data) {
    var recorded_dur = 0;
    var recorded_count = 0;
    var media_dur = 0;
    var media_count = 0;
    var live_dur = 0;
    var live_count = 0;
    var program_ids = [];
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      // While accumulating keep total duration in seconds.
      var duration = event.end - event.start;
      switch (event.type) {
        case "record":
          recorded_dur += duration;
          recorded_count += 1;
          break;
        case "live":
          live_dur += duration;
          live_count += 1;
          break;
        case "play":
          media_dur += duration;
          media_count += 1;
          break;
        default:
          break;
      }
      if (program_ids.indexOf(event.program_id) == -1) {
        program_ids.push(event.program_id);
      }
    }
    recorded_dur = duration_seconds_to_minutes(recorded_dur);
    media_dur = duration_seconds_to_minutes(media_dur);
    live_dur = duration_seconds_to_minutes(live_dur);
    caption = "Recorded: " + format_duration(recorded_dur) + " - Watched: " + format_duration(media_dur + live_dur) + " (Media: " + format_duration(media_dur) + " / Live: " + format_duration(live_dur) + ") - ";
    caption += program_ids.length + (program_ids.length == 1 ? " programme - " : " programmes - ");
    caption += data.events.length + (data.events.length == 1 ? " event" : " events");
    return caption;
  }

  //////
  // Search the EPG using values from the text fields.
  //////
  function searchEpg() {
    $('#search_prompt').html("Enter all or part of the title, synopsis or channel name, then search for the history of that programme.");

    var title = $('#search_criteria_title').val();
    var synopsis = $('#search_criteria_synopsis').val();
    var channel = $('#search_criteria_channel').val();
    var title_op = $('#search_criteria_op_title').val();
    var synopsis_op = $('#search_criteria_op_synopsis').val();
    var channel_op = $('#search_criteria_op_channel').val();

    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/epgsearch_json.jim?title=' + encodeURIComponent(title) + '&channel=' + encodeURIComponent(channel) + '&synopsis=' + encodeURIComponent(synopsis) + '&title_op=' + title_op + '&channel_op=' + channel_op + '&synopsis_op=' + synopsis_op;
    } else {
      var url = '/tvdiary/json/epgsearch_json.json?nocache';
    }

    $('#search_results_table tbody').html("");
    $('#search_results_table').trigger("update");
    $('#search_results_caption').html("Programme events");
    $('#search_results_footer').html("");
    $('#search_results_spinner').show('fast');

    // Asynchronously request the search tables' data.
    isBusyS = true;
    $('#search_diary_button').attr("disabled", "disabled");
    $('#search_epg_button').attr("disabled", "disabled");
    $.ajax({
      type: "GET",
      dataType: "json",
      url: url,
      success: function(data) {
        if (data.status == "OK" ) {
          $('#search_criteria_title').val(data.title ? data.title : "");
          $('#search_criteria_synopsis').val(data.synopsis ? data.synopsis : "");
          $('#search_criteria_channel').val(data.channel_name ? data.channel_name : "");
          $('#search_criteria_op_title').val(data.title_op ? data.title_op : "C");
          $('#search_criteria_op_synopsis').val(data.synopsis_op ? data.synopsis_op : "C");
          $('#search_criteria_op_channel').val(data.channel_name_op ? data.channel_name_op : "C");
          if (data.events.length > 0) {
            $('#search_results_table tbody').html(epgsearch_json_to_html(data));
            bind_dejavu($('#search_results_table'));
            bind_crid_repeats($('#search_results_table'));
            bind_inventory($('#search_results_table'));
            $('#search_results_caption').html(epgsearch_json_to_caption(data));
            $("#search_results_table").trigger("update");
            // Must delay sorting because the tablesorter introduces a delay before it acts on the "update".
            setTimeout(function(){
              showingHistoryResults = false;
              $("#search_results_table").trigger("sorton",[epgsearch_sorting]); 
            }, 2);
          } else {
            $('#search_results_footer').html("<span class=\"nothing\">No matches found</span>");
          }
        } else {
          $('#search_results_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        $('#search_results_spinner').hide('slow');
        isBusyS = false;
        $('#search_diary_button').removeAttr("disabled");
        $('#search_epg_button').removeAttr("disabled");
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#search_results_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#search_results_spinner').hide('slow');
        isBusyS = false;
        $('#search_diary_button').removeAttr("disabled");
        $('#search_epg_button').removeAttr("disabled");
      }
    });
  }

  //////
  // Render epgsearch HTML from JSON.
  //////
  function epgsearch_json_to_html(data) {
    var html = "";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];

      html += "<tr class=\"event_row visible_event\">";

      html += "<td class=\"search_type\">";
      html += "<!-- warning:" + event.warning + ", content_type:" + event.content_type + ", content:" + event.content + ", event_crid:" + event.event_crid + ", series_crid:" + event.series_crid + ", rec_crid:" + event.rec_crid + ". -->";
      html += "</td>";

      html += "<td class=\"search_channel\">";
      if (event.channel_name != "") {
        html += "<div>";
        html += "<img src=\"" + event.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
        html += "<span>" + escapeHtml(event.channel_name) + "</span>";
        html += "</div>";
      }
      html += "</td>";

      html += "<td class=\"search_title\">";
      html += "<div>" + escapeHtml(event.title) + "</div>";
      html += "</td>";

      html += "<td class=\"search_synopsis\">";
      html += "<div>" + escapeHtml(event.synopsis) + "</div>";
      html += "</td>";

      html += "<td class=\"search_datetime\" sval=\"" + event.start + "\">";
      html += formatDateTime(event.start);
      html += "</td>";

      html += "<td class=\"search_duration\" sval=\"" + event.duration + "\">";
      html += event.duration + (event.duration == 1 ? " min" : " mins");
      html += "</td>";

      html += "<td class=\"search_flags\">";
      if (inventory_enabled) {
        if (event.available) {
          html += "<a class=\"inventory\" href=\"#\"><img src=\"images/available.png\" width=16 height=16 title=\"available\"></a>";
        }
      }
      if (event.repeat_crid_count > 0) {
        html += " <a class=\"repeat\" prog_crid=\"" + event.event_crid + "\" href=\"#\"><img src=\"images/repeat.png\" width=16 height=16 title=\"CRID repeat\"></a>";
      } else if (event.repeat_program_id != -1) {
        html += " <a class=\"dejavu\" prog_id=\"" + event.repeat_program_id + "\" href=\"#\"><img src=\"images/dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
      }
      if (event.ucRecKind == 1) {
        html += "<img src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording programme\">";
      } else if (event.ucRecKind == 2 || event.ucRecKind == 4) {
        html += "<img src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording series\">";
      } else if (event.crid_ucRecKind == 1) {
        html += "<img class=\"collateral_scheduled\" src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording another time\">";
      } else if (event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4) {
        html += "<img class=\"collateral_scheduled\" src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording another time\">";
      }
      html += "</td>";

      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render results caption from JSON.
  //////
  function epgsearch_json_to_caption(data) {
    caption = data.events.length + (data.events.length == 1 ? " match" : " matches");
    return caption;
  }

  ////////////////////////////////
  // Watchlist panel code
  ////////////////////////////////

  //////
  // Request display of watchlist results.
  //////
  function update_watchlist() {
    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/watchlist_json.jim?modified=' + watchlist_modified;
    } else {
      var url = '/tvdiary/json/watchlist_json.json?nocache';
    }

    //$('#watchlist_results_footer').html("");
    $('#watchlist_results_spinner').show('fast');

    // Asynchronously request the history tables' data.
    isBusyWL = true;
    $.ajax({
      type: "GET",
      dataType: "json",
      url: url,
      success: function(data) {
        if (data.status == "OK" ) {
          var now_time = Math.round(new Date().getTime() / 1000);
          if (data.time_to_build_watchlist < now_time || data.watchlist_next_line != 0) {
            $('#watchlist_prompt').html("The watchlist is being recalculated.");
          } else {
            $('#watchlist_prompt').html("The watchlist is recalculated daily. Press to edit its specification.");
          }

          if (data.events.length > 0) {
            $('#watchlist_results_table tbody').html(watchlist_json_to_html(data));
            bind_dejavu($('#watchlist_results_table'));
            bind_crid_repeats($('#watchlist_results_table'));
            bind_inventory($('#watchlist_results_table'));
            $('#watchlist_results_caption').html(watchlist_json_to_caption(data));
            bind_caption_counts($('#watchlist_results_caption'), $('#watchlist_results_table'), $('#watchlist_results_footer'), "<span class=\"nothing\">All programmes filtered out</span>");

            update_event_visibility(".watch_scheduled", $('#watchlist_results_table'), $('#watchlist_results_caption span[toggle=".watch_scheduled"]'), events_visible[".watch_scheduled"]);
            update_event_visibility(".watch_crid_repeat", $('#watchlist_results_table'), $('#watchlist_results_caption span[toggle=".watch_crid_repeat"]'), events_visible[".watch_crid_repeat"]);
            update_event_visibility(".watch_dejavu_repeat", $('#watchlist_results_table'), $('#watchlist_results_caption span[toggle=".watch_dejavu_repeat"]'), events_visible[".watch_dejavu_repeat"]);
            if (count_visible_events($('#watchlist_results_table')) == 0 ) {
              $('#watchlist_results_footer').html("<span class=\"nothing\">All programmes filtered out</span>");
            } else {
              $('#watchlist_results_footer').html("");
            }

            $("#watchlist_results_table").trigger("update");
            // Must delay sorting because the tablesorter introduces a delay before it acts on the "update".
            setTimeout(function(){
              $("#watchlist_results_table").trigger("sorton",[watchlist_sorting]); 
            }, 2);
          } else {
            $('#watchlist_results_caption').html("Programme events");
            $('#watchlist_results_footer').html("<span class=\"nothing\">No matches found</span>");
            $('#watchlist_results_table tbody').html("");
            $('#watchlist_results_table').trigger("update");
          }
          watchlist_modified = data.modified;
        } else if (data.status == "UNMODIFIED") {
          // NOP - the latest data is already visible.
          var now_time = Math.round(new Date().getTime() / 1000);
          if (data.time_to_build_watchlist < now_time || data.watchlist_next_line != 0) {
            $('#watchlist_prompt').html("The watchlist is being recalculated.");
          } else {
            $('#watchlist_prompt').html("The watchlist is recalculated daily. Press to edit its specification.");
          }
        } else {
          $('#watchlist_results_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        $('#watchlist_results_spinner').hide('slow');
        isBusyWL = false;
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#watchlist_results_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#watchlist_results_spinner').hide('slow');
        isBusyWL = false;
      }
    });
  }

  //////
  // Render watchlist HTML from JSON.
  //////
  function watchlist_json_to_html(data) {
    var html = "";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];

      var classes = "";
      if (event.repeat_crid_count > 0) {
        classes += " watch_crid_repeat";
      } else if (event.repeat_program_id != -1) {
        classes += " watch_dejavu_repeat";
      }
      if (event.ucRecKind == 1 || event.ucRecKind == 2 || event.ucRecKind == 4 || event.crid_ucRecKind == 1 || event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4) {
        classes += " watch_scheduled";
      }

      html += "<tr class=\"event_row visible_event" + classes + "\">";

      html += "<td class=\"search_channel\">";
      if (event.channel_name != "") {
        html += "<div>";
        html += "<img src=\"" + event.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
        html += "<span>" + escapeHtml(event.channel_name) + "</span>";
        html += "</div>";
      }
      html += "</td>";

      html += "<td class=\"search_title\">";
      html += "<div>" + escapeHtml(event.title) + "</div>";
      html += "</td>";

      html += "<td class=\"search_synopsis\">";
      html += "<div>" + escapeHtml(event.synopsis) + "</div>";
      html += "</td>";

      html += "<td class=\"search_datetime\" sval=\"" + event.start + "\">";
      html += formatDateTime(event.start);
      html += "</td>";

      html += "<td class=\"search_duration\" sval=\"" + event.duration + "\">";
      html += event.duration + (event.duration == 1 ? " min" : " mins");
      html += "</td>";

      html += "<td class=\"search_flags\">";
      if (event.repeat_crid_count > 0) {
        html += " <a class=\"repeat\" prog_crid=\"" + event.event_crid + "\" href=\"#\"><img src=\"images/repeat.png\" width=16 height=16 title=\"CRID repeat\"></a>";
      } else if (event.repeat_program_id != -1) {
        html += " <a class=\"dejavu\" prog_id=\"" + event.repeat_program_id + "\" href=\"#\"><img src=\"images/dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
      }
      if (event.ucRecKind == 1) {
        html += "<img src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording programme\">";
      } else if (event.ucRecKind == 2 || event.ucRecKind == 4) {
        html += "<img src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording series\">";
      } else if (event.crid_ucRecKind == 1) {
        html += "<img class=\"collateral_scheduled\" src=\"images/175_1_11_Reservation_Record.png\" width=16 height=16 title=\"Recording another time\">";
      } else if (event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4) {
        html += "<img class=\"collateral_scheduled\" src=\"images/175_1_11_Series_Record.png\" width=28 height=16 title=\"Recording another time\">";
      }
      html += "</td>";

      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render results caption from JSON.
  //////
  function watchlist_json_to_caption(data) {
    var num_matches = data.events.length;
    var num_new = 0;
    var num_scheduled = 0;
    var num_crid_repeats = 0;
    var num_dejavu = 0;
    var distinct_new_crids = new Array();
    
    for (var i = 0; i < num_matches; i++) {
      var event = data.events[i];
      var isNew = true;
      if (event.repeat_crid_count > 0) {
        num_crid_repeats += 1;
        isNew = false;
      } else if (event.repeat_program_id != -1) {
        num_dejavu += 1;
        isNew = false;
      }
      if (event.ucRecKind == 1 || event.ucRecKind == 2 || event.ucRecKind == 4 || event.crid_ucRecKind == 1 || event.crid_ucRecKind == 2 || event.crid_ucRecKind == 4) {
        num_scheduled += 1;
        isNew = false;
      }
      if (isNew) {
        num_new += 1;
        if (distinct_new_crids.indexOf(event.event_crid) == -1) {
          distinct_new_crids.push(event.event_crid);
        }
      }
    }

    caption = "Matches: " + num_matches + " (New: " + num_new + " / Distinct new: " + distinct_new_crids.length;
    caption += " / <span class=\"caption_count\" toggle=\".watch_scheduled\">Already scheduled: " + num_scheduled + "</span>";
    caption += " / <span class=\"caption_count\" toggle=\".watch_crid_repeat\">CRID repeats: " + num_crid_repeats + "</span>";
    caption += " / <span class=\"caption_count\" toggle=\".watch_dejavu_repeat\">D&eacute;j&agrave; vu repeats: " + num_dejavu + "</span>)";
    return caption;
  }

  //////
  // Start editing.
  //////
  function start_editing_watchlist() {
    $("#watchlist_modify_button").hide();
    $('#watchlist_specification').slideToggle('slow');

    $('#watchlist_modify_spinner').show();
    $('#watchlist_prompt').html("Fetching the existing watchlist specification...");
    $('#watchlist_text').val("");

    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/get_watchlist_cfg_json.jim';
    } else {
      var url = '/tvdiary/json/get_watchlist_cfg.txt?nocache';
    }
    $.ajax({
      type: "GET",
      dataType: "json",
      url: url,
      success: function(data) {
        if (data.status == "OK") {
          $('#watchlist_text').val(data.text);
        }
        $('#watchlist_prompt').html("Edit the specification, then hit Save.");
        $('#watchlist_modify_spinner').hide('slow');
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#watchlist_prompt').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#watchlist_modify_spinner').hide('slow');
      }
    });
  }

  //////
  // Finish editing.
  //////
  function finish_editing_watchlist() {
    $('#watchlist_modify_spinner').show();
    $('#watchlist_prompt').html("Saving the watchlist specification...");

    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/update_watchlist_cfg_json.jim';
    } else {
      var url = '';
    }
    var formdata = $('#watchlist_form').serialize();
    $.ajax({
      type: "POST",
      data: formdata,
      dataType: "json",
      url: url,
      success: function(data) {
        if (data.status == "OK") {
          console.log(data.text);
          $('#watchlist_prompt').html("The specification has been saved. The watchlist will be recalculated in the next few minutes.");

          // Only switch if OK.
          $("#watchlist_specification").slideToggle('slow');
          $('#watchlist_modify_button').show();
          $('#watchlist_results_caption').html("Programme events");
          $('#watchlist_results_table tbody').html("");
          $('#watchlist_results_table').trigger("update");
          $('#watchlist_results_footer').html("<span class=\"nothing\">No matches found</span>");
        } else {
          $('#watchlist_prompt').html(data.status);
        }
        $('#watchlist_modify_spinner').hide('slow');
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#watchlist_prompt').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#watchlist_modify_spinner').hide('slow');
      }
    });
  }

  ////////////////////////////////
  // Inventory panel code
  ////////////////////////////////

  //////
  // Update the contents of the inventory panel.
  //////
  function update_inventory() {
    if (typeof snapshot_time == "undefined") {
      var url = '/tvdiary/inventory_json.jim?modified=' + inventory_modified;
    } else {
      var url = '/tvdiary/json/inventory.json?nocache';
    }
    $('#inventory_spinner').show();
    $('#inventory_footer').html("");
    $.ajax({
      type: "GET",
      dataType: "json",
      url: url,
      success: function(data) {
        if (data.status == "OK") {
          if (data.events.length == 0) {
            $('#inventory_caption').html("[HDD] My Video");
            $('#inventory_table tbody').html("");
            $('#inventory_footer').html("<span class=\"nothing\">Nothing</span>");
          } else {
            $('#inventory_caption').html("[HDD] My Video - " + format_duration(inventory_json_to_total_duration(data)));
            $('#inventory_table tbody').html(inventory_json_to_html(data));
            bind_dejavu($('#inventory_table'));
          }
          inventory_modified = data.modified;
        } else if (data.status == "UNMODIFIED") {
          // NOP - the latest data is already visible.
        } else {
          $('#inventory_caption').html("[HDD] My Video");
          $('#inventory_table tbody').html("");
          $('#inventory_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        $('#inventory_spinner').hide('slow');
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#inventory_caption').html("[HDD] My Video");
        $('#inventory_table tbody').html("");
        $('#inventory_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#inventory_spinner').hide('slow');
      }
    });
  }

  //////
  // Render inventory HTML from JSON.
  //////
  function inventory_json_to_html(data) {
    var cur_dir = "";
    var count_in_dir = 0;
    var html = "";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];

      if (event.directory != cur_dir) {
        html += "<tr class=\"inventory_dir\">";
        html += "<td colspan=\"4\" class=\"inventory_dir\">";
        html += escapeHtml(event.directory);
        html += "</td>";
        html += "</tr>";
        cur_dir = event.directory;
        count_in_dir = 1;
      }

      html += "<tr class=\"event_row " + (count_in_dir % 2 ? "odd" : "even" ) + "\">";
      count_in_dir += 1;

      //
      // Column 1. The channel icon and name.
      //
      html += "<td class=\"tvchannel\">";
      if (event.channel_name != "") {
        html += "<img src=\"" + event.channel_icon_path + "\" width=50 height=50 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
        html += "<div>" + escapeHtml(event.channel_name) + "</div>";
      }
      html += "</td>";

      // Column 2 - the thumbnail.
      html += "<td class=\"tvchannel\">";
      if (event.has_thumbnail) {
        if (typeof snapshot_time == "undefined") {
          html += "<img class=\"bmp\" src=\"/browse/bmp.jim?file=" + encodeURIComponent(event.directory + "/" + event.filename) + "\">";
        } else {
          html += "<img class=\"bmp\" src=\"thumbs/" + encodeURIComponent(event.filename) + ".png\">";
        }
      } else {
          html += "<img src=\"images/744_1_10_Video_Preview.png\">";
      }
      html += "</td>";
      //
      // Column 3. Title, times and synopsis.
      // .mp4 files have times but no duration.
      //
      html += "<td class=\"event_descr\">";
      html += "<span class=\"tvtitle\">" + escapeHtml(event.title) + "</span>";
      html += "<br><span class=\"\">";
      html += formatTime(event.event_start) + "&nbsp;&nbsp;" + formatVShortDate(event.event_start);
      if (event.event_duration > 0) {
        html += "&nbsp;&nbsp;" + event.event_duration + (event.event_duration == 1 ? "min" : "mins");
      }
      html += "</span>";
      if (event.synopsis != "") {
        html += "<span class=\"tvsynopsis\">" + escapeHtml(event.synopsis) + "</span>";
      }
      if (event.scheduled_start != 0) {
        html += "<span class=\"tvschedule\">(" + formatDateTime(event.scheduled_start);
        if (event.scheduled_duration != 0) {
          html += ", " + event.scheduled_duration + (event.scheduled_duration == 1 ? " min" : " mins");
        }
        html += ")</span>";
      }
      html += "</td>"

      //
      // Column 4. Icons for deja vu icon.
      //
      html += "<td class=\"event_flags\">";
      if (!event.watched) {
        html += "<img src=\"images/unwatched.png\" width=16 height=16 title=\"unwatched\">";
      }
      if (event.repeat_crid_count > 0) {
        html += " <a class=\"repeat\" prog_crid=\"" + event.event_crid + "\" href=\"#\"><img src=\"images/repeat.png\" width=16 height=16 title=\"CRID repeat\"></a>";
      } else if (event.repeat_program_id != -1) {
        html += " <a class=\"dejavu\" prog_id=\"" + event.repeat_program_id + "\" href=\"#\"><img src=\"images/dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
      }
      html += "</td>"

      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Calculate the total duration of the videos from JSON.
  //////
  function inventory_json_to_total_duration(data) {
    var total_duration = 0;
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      total_duration += event.event_duration;
    }
    return total_duration;
  }

  ////////////////////////////////
  ////////////////////////////////

  // Last thing to do when the page loads: show today's details.
  update_daily(today_start);
});
// End of $(document).ready(function() {})
