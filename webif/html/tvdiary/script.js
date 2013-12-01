/*
 * TV Diary main display page scripts.
 * Author: Martin Wink, 2013.
 */

// Globals
// day_start comes from calendar_params.js/jim

// Today's calendar date start. Fixed at page load.
var today_start = Math.floor(new Date().getTime() / 86400000.0) * 86400 + day_start;

// Whether live broadcasts are to be displayed. Toggled on and off.
var including_live = true;

// Start time for the displayed details, with the day_start offset included. Changed by the datepicker.
var display_start;
var display_end;

function setCookie(c_name, value) {
  var exdate = new Date();
  exdate.setDate(exdate.getDate() + 365);
  var c_value = escape(value) + "; expires=" + exdate.toUTCString();
  document.cookie = c_name + "=" + c_value;
}

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

$(document).ready(function() {

  $().UItoTop({easingType: 'easeOutQuart'});
  $('.backtotop').click(function() {
    $('html, body').animate({scrollTop: 0}, 500);
  });

  $('#datepicker').datepicker({
          firstDay: 1,
          dateFormat: '@',  //@=ms since 01/01/1970.
          minDate: new Date(min_time * 1000),
          maxDate: 7,
          onSelect: function(val, inst) {
                  // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
                  var chosen  = Math.round(val / 86400000.0) * 86400 + day_start;
                  request_update(chosen);                  
          }
  });

  // The cookie is loaded as a string - convert to boolean, but default to true if missing.
  // Set the checked state before initializing the iphoneStyle checkbox.
  including_live = getCookie("tvdiary_live_tv");
  including_live = (including_live != "false");
  if (including_live) {
    $('#include_live').attr("checked","checked").change();
  } else {
    $('#include_live').removeAttr("checked").change();
  }

  $('#include_live').iphoneStyle({
    checkedLabel: 'Yes',
    uncheckedLabel: 'No'
  });

  $('#include_live').change(function() {
    // I can't get other methods, including is(":checked"), to work.
    show_live($(this).is('[checked=checked]'));
  });

  function show_live(state) {
    including_live = state;
    $( "#watched_inner tr.live_event" ).each(function( index ) {
      if (state) {
        $(this).addClass("visible_event").removeClass("hidden_event");
      } else {
        $(this).addClass("hidden_event").removeClass("visible_event");
      }
    });
    apply_altrow( $("#watched_inner") );
    if (state) {
      $(".live_count").removeClass('live_count_hidden');
    } else {
      $(".live_count").addClass('live_count_hidden');
    }
    setCookie("tvdiary_live_tv", including_live);
  }

  function apply_altrow(data) {
    $("tr.event_row.visible_event", data).each(function(i, tr) {
      if (i % 2) {
        $(tr).addClass('odd').removeClass('even');
      } else {
        $(tr).addClass('even').removeClass('odd');
      }
    });
    return data;
  }
  
  function make_all_visible(data) {
    var jqd = $(data);
    $('tr.event_row', jqd).each(function(i, tr) {
      $(tr).addClass('visible_event').removeClass('hidden_event');
    });
    return jqd;
  }

  function duration_within_display_range(tr) {
    var start = $(tr).attr('event_start');
    var end = $(tr).attr('event_end');
    if (start < display_start) {
      return Math.round((end - display_start + 0) / 60);
    } else if (end > display_end) {
      return Math.round((display_end - start + 0) / 60);
    } else {
      return Math.round((end - start) / 60);
    }    
  }
  
  function two_digits(num) {
    var ret = String(num);
    if (ret.length < 2) {ret = "0" + ret;}
    return ret;
  }

  function format_duration(duration) {
    return two_digits(Math.floor(duration / 60)) + ":" + two_digits(duration % 60);
  }

  function update_recorded_duration(data) {
    // NB durations are all in minutes, times are in seconds.
    var total_recorded = 0;
    var total_scheduled = 0;

    $("tr.record_event", data).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr);
      total_recorded += constrained_duration;
    });

    $("tr.future_event", data).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr);
      total_scheduled += constrained_duration;
    });

    if (display_start < today_start) {
      if (total_recorded == 0) {
        $('#recorded_caption').html( "Recorded nothing");
      } else {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded));
      }
    } else if (display_start > today_start) {
      if (total_scheduled == 0) {
        $('#recorded_caption').html( "Nothing to be recorded");
      } else {
        $('#recorded_caption').html( "To be recorded - " + format_duration(total_scheduled));
      }
    } else {
      if (total_recorded == 0 && total_scheduled == 0) {
        $('#recorded_caption').html( "Recorded nothing");
      } else if (total_recorded == 0) {
        $('#recorded_caption').html( "To be recorded - " + format_duration(total_scheduled));
      } else if (total_scheduled == 0) {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded));
      } else {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded) + " / To be recorded - " + format_duration(total_scheduled));
      }
    }
  }
  
  function update_watched_duration(data) {
    // NB durations are all in minutes, times are in seconds.
    var total_played = 0;
    var total_live = 0;

    $("tr.play_event", data).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr);
      total_played += constrained_duration;
    });

    $("tr.live_event", data).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr);
      total_live += constrained_duration;
    });

    var combined_duration = total_played + total_live;
    
    if (combined_duration == 0) {
      $('#watched_caption').html( "Watched nothing");
    } else if (total_live == 0) {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + ")");
    } else if (total_played == 0) {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (<span class=\"live_count\">Live: " + format_duration(total_live) + "<span>)");
    } else {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + " <span class=\"live_count\">/ Live: " + format_duration(total_live) + "</span>)");
    }
  }

  function request_update(chosen) {
    $('#title_date').html( " - " + $.datepicker.formatDate("d MM yy", new Date(chosen * 1000)) );

    $('#recorded_inner').html("");
    $('#recorded_spinner').show('fast');
    $('#watched_inner').html("");
    $('#watched_spinner').show('fast');

    display_start = chosen;
    display_end = chosen + 86400;

    if (chosen < today_start) {
      $('#recorded_caption').html( "Recorded" );
    } else if (chosen > today_start) {
      $('#recorded_caption').html( "To be recorded" );
    } else {
      $('#recorded_caption').html( "Recorded / To be recorded" );
    }
    $('#watched_caption').html( "Watched" );

    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + chosen + "&type=R",
      success: function(data) {
        $('#recorded_inner').html(make_all_visible(data));
        apply_altrow($('#recorded_inner'));
        update_recorded_duration($('#recorded_inner'));
        $('#recorded_spinner').hide('slow');
      },
      error: function(_, _, e) {
        if (window.console) {
          console.log("ajax error " + e);
        }
        $('#recorded_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#recorded_spinner').hide('slow');
      }
    });
    
    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + chosen + "&type=W",
      success: function(data) {
        $('#watched_inner').html(make_all_visible(data));
        update_watched_duration( $('#watched_inner') );
        show_live(including_live);
        $('#watched_spinner').hide('slow');
      },
      error: function(_, _, e) {
        if (window.console) {
          console.log("ajax error " + e);
        }
        $('#watched_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#watched_spinner').hide('slow');
      }
    });
  }

  // When the page loads, show today's details.
  request_update(today_start);

});
