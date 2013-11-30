/*
 * TV Diary main display page scripts.
 * Author: Martin Wink, 2013.
 */

var today_start = Math.floor(new Date().getTime() / 86400000.0) * 86400 + day_start;

var including_live = true;

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

  $('#include_live').iphoneStyle({
    checkedLabel: 'Show',
    uncheckedLabel: 'Hide'
  });
  $('#include_live').change(function() {
    show_live($(this).is('[checked=checked]'));
  });

  function show_live(state) {
    including_live = state;
    $( "div#watched_inner tr.live_event" ).each(function( index ) {
      if (state) {
        $(this).addClass("visible_event").removeClass("hidden_event");
      } else {
        $(this).addClass("hidden_event").removeClass("visible_event");
      }
    });
    apply_altrow( $( "div#watched_inner" ) );
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
  
  function request_update(chosen) {
    $('#title_date').html( " - " + $.datepicker.formatDate("d MM yy", new Date(chosen * 1000)) );

    if (chosen > today_start) {
      $('#recorded_caption').html( "To be recorded" );
    } else {
      $('#recorded_caption').html( "Recorded" );
    }
    
    $('#recorded_inner').html("");
    $('#recorded_spinner').show('fast');
    $('#watched_inner').html("");
    $('#watched_spinner').show('fast');

    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + chosen + "&type=R",
      success: function(data) {
        $('#recorded_inner').html(make_all_visible(data));
        apply_altrow($('#recorded_inner'));
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
